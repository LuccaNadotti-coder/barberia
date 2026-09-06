import { Resend } from 'resend'
import { opcional, requerida, urlSitio } from './entorno'
import { fechaLarga, hora12, soles } from './fechas'
import { generarICS, nombreICS } from './ics'

/**
 * Correo 100 % automático (a diferencia de WhatsApp, que es manual a propósito).
 *
 * El correo de confirmación lleva el .ics adjunto: el cliente lo toca y la
 * cita entra en su calendario con alarma 2 h antes.
 *
 * ── DOS PROVEEDORES, Y NO ES POR CAPRICHO ───────────────────────────────────
 *
 * **Resend** exige verificar un DOMINIO. Mientras no lo hagas, su remitente de
 * pruebas `onboarding@resend.dev` **sólo entrega al dueño de la cuenta**; a
 * cualquier otro destinatario responde 403 diciéndolo con todas las letras. Es
 * la mejor opción, pero obliga a tener un dominio.
 *
 * **Brevo** verifica UNA DIRECCIÓN suelta (un Gmail vale). Sin dominio, sin
 * gastar, 300 correos/día. A cambio, un remitente de Gmail cae en spam más a
 * menudo que uno de dominio propio.
 *
 * Se elige solo: si hay `BREVO_API_KEY`, se usa Brevo; si no, Resend. Así el
 * día que haya dominio se vuelve a Resend borrando una variable, sin tocar
 * código.
 *
 * Brevo va por `fetch` a pelo, sin SDK: son 20 líneas y el proyecto ya evita
 * dependencias que no aportan (mira `r2.ts`, que firma SigV4 a mano para no
 * arrastrar 15 MB de SDK de AWS).
 */

const NOMBRE_LOCAL = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'
const DIRECCION_LOCAL = process.env.NEXT_PUBLIC_DIRECCION_LOCAL || ''

function resend(): Resend {
  return new Resend(requerida('RESEND_API_KEY'))
}

/** Brevo si hay clave suya; si no, Resend. */
function proveedor(): 'brevo' | 'resend' {
  return opcional('BREVO_API_KEY') ? 'brevo' : 'resend'
}

/** El remitente. `EMAIL_FROM` manda; `RESEND_FROM` se mantiene por compatibilidad. */
function remitente(): string | undefined {
  return opcional('EMAIL_FROM') ?? opcional('RESEND_FROM')
}

export function emailConfigurado(): boolean {
  if (!remitente()) return false
  return Boolean(opcional('BREVO_API_KEY') ?? opcional('RESEND_API_KEY'))
}

/** Parte `Nombre <correo@dominio>` en sus dos trozos. Brevo los quiere aparte. */
export function partirRemitente(from: string): { nombre?: string; correo: string } {
  const t = from.trim()
  const i = t.indexOf('<')
  if (i === -1) return { correo: t }
  return {
    nombre: t.slice(0, i).trim().replace(/^"|"$/g, '') || undefined,
    correo: t.slice(i + 1, t.indexOf('>')).trim(),
  }
}

/**
 * `RESEND_FROM` admite `correo@dominio` o `Nombre <correo@dominio>`. Cualquier
 * otra cosa la rechaza Resend con «Invalid `from` field» y el correo no sale.
 *
 * Se comprueba aquí y no sólo en Resend porque el fallo llegaba tarde y callado:
 * quedaba anotado en `notificaciones` y nadie lo miraba. Pasó en producción con
 * un valor entre comillas copiado del `.env` al panel de Vercel — ver
 * `sinComillas()` en entorno.ts.
 */
export function remitenteValido(from: string): boolean {
  const t = from.trim()

  // El caso que rompió producción: comillas envolviendo TODO el valor. Hay que
  // mirarlo antes de extraer el correo de entre <>, porque si no se cuela: el
  // correo de dentro es perfectamente válido y las comillas quedan fuera.
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.at(-1) === t[0]) return false

  const correo = t.includes('<') ? t.slice(t.indexOf('<') + 1, t.indexOf('>')) : t
  return /^[^@<>\s"']+@[^@<>\s"']+\.[a-zA-Z]{2,}$/.test(correo.trim())
}

export interface DatosCorreo {
  id: string
  codigo: string
  cliente_nombre: string
  cliente_email: string | null
  servicio_nombre: string
  barbero_nombre: string
  inicio: string
  fin: string
  precio_centimos: number
  adelanto_centimos: number
  expira_en?: string | null
  motivo?: string
}

export interface ResultadoEnvio {
  ok: boolean
  id?: string
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLANTILLA
//  HTML de correo: tablas y estilos en línea. Nada de flexbox, grid ni <style>
//  en <head> — Outlook y Gmail los descartan.
// ═══════════════════════════════════════════════════════════════════════════════

const TINTA = '#0D1420'
const HUESO = '#EDE8DF'
const LATON = '#C2A063'
const GRIS = '#8A94A6'

function envoltorio(titulo: string, contenido: string, pie?: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2DDD2;">
    <tr><td style="background:${TINTA};padding:22px 26px;">
      <div style="color:${LATON};font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">${escapar(NOMBRE_LOCAL)}</div>
      <div style="color:${HUESO};font-size:21px;font-weight:700;margin-top:6px;">${escapar(titulo)}</div>
    </td></tr>
    <tr><td style="padding:26px;color:#2A2F38;font-size:15px;line-height:1.6;">${contenido}</td></tr>
    <tr><td style="padding:16px 26px;background:#FAF8F4;border-top:1px solid #E2DDD2;color:${GRIS};font-size:12px;line-height:1.5;">
      ${pie ?? `${escapar(NOMBRE_LOCAL)}${DIRECCION_LOCAL ? ' · ' + escapar(DIRECCION_LOCAL) : ''}`}
    </td></tr>
  </table>
</td></tr></table></body></html>`
}

/** Ficha con los datos de la cita. Es lo que la gente mira, así que va arriba. */
function ficha(d: DatosCorreo): string {
  const saldo = d.precio_centimos - d.adelanto_centimos
  const fila = (k: string, v: string, mono = false) => `
    <tr>
      <td style="padding:7px 0;color:${GRIS};font-size:13px;width:38%;">${escapar(k)}</td>
      <td style="padding:7px 0;color:#2A2F38;font-size:14px;font-weight:600;${mono ? "font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;letter-spacing:0.5px;" : ''}">${escapar(v)}</td>
    </tr>`

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F4;border:1px solid #E9E4D9;border-radius:10px;padding:14px 16px;margin:4px 0 18px;">
    ${fila('Código', d.codigo, true)}
    ${fila('Servicio', d.servicio_nombre)}
    ${fila('Barbero', d.barbero_nombre)}
    ${fila('Día', capitalizar(fechaLarga(d.inicio)))}
    ${fila('Hora', hora12(d.inicio), true)}
    ${fila('Adelanto', soles(d.adelanto_centimos), true)}
    ${fila('Saldo en el local', soles(saldo), true)}
  </table>`
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ENVÍOS
// ═══════════════════════════════════════════════════════════════════════════════

/** 1 · Pre-reserva: se manda al recibir la captura. NO confirma nada. */
export async function enviarPreReserva(d: DatosCorreo): Promise<ResultadoEnvio> {
  return enviar(d, {
    asunto: `Recibimos tu comprobante — ${d.codigo}`,
    titulo: 'Comprobante recibido',
    cuerpo: `
      <p style="margin:0 0 14px;">Hola <strong>${escapar(pila(d.cliente_nombre))}</strong>, ya tenemos tu captura del adelanto.</p>
      ${ficha(d)}
      <p style="margin:0 0 12px;padding:12px 14px;background:#FFF6E0;border-left:3px solid ${LATON};border-radius:0 8px 8px 0;">
        <strong>Tu cita todavía no está confirmada.</strong> ${escapar(d.barbero_nombre)} revisará el comprobante
        y te llegará un segundo correo en cuanto la valide. Suele tardar poco.
      </p>
      <p style="margin:0;color:${GRIS};font-size:13px;">Guarda tu código <strong>${escapar(d.codigo)}</strong>: es lo que te pediremos al llegar.</p>`,
  })
}

/** 2 · Confirmación: el barbero validó. Aquí SÍ va el .ics. */
export async function enviarConfirmacion(d: DatosCorreo): Promise<ResultadoEnvio> {
  const ics = generarICS({
    uid: d.id,
    codigo: d.codigo,
    inicio: d.inicio,
    fin: d.fin,
    servicio: d.servicio_nombre,
    barbero: d.barbero_nombre,
    local: NOMBRE_LOCAL,
    direccion: DIRECCION_LOCAL || undefined,
    url: urlSitio(),
  })

  return enviar(
    d,
    {
      asunto: `Cita confirmada · ${capitalizar(fechaLarga(d.inicio))} ${hora12(d.inicio)} — ${d.codigo}`,
      titulo: '¡Cita confirmada!',
      cuerpo: `
      <p style="margin:0 0 14px;">Listo, <strong>${escapar(pila(d.cliente_nombre))}</strong>. Tu adelanto quedó registrado y el horario es tuyo.</p>
      ${ficha(d)}
      <p style="margin:0 0 14px;">Adjuntamos un archivo <strong>.ics</strong>: ábrelo y la cita se agrega sola a tu calendario, con recordatorio 2 horas antes.</p>
      <p style="margin:0;color:${GRIS};font-size:13px;">Si necesitas moverla o cancelar, escríbenos por WhatsApp con tu código.</p>`,
    },
    [{ filename: nombreICS(d.codigo), content: Buffer.from(ics, 'utf8').toString('base64') }],
  )
}

/** 3 · Recordatorio: lo dispara el cron el día anterior a las 9:00 de Lima. */
export async function enviarRecordatorio(d: DatosCorreo): Promise<ResultadoEnvio> {
  const saldo = d.precio_centimos - d.adelanto_centimos
  return enviar(d, {
    asunto: `Mañana a las ${hora12(d.inicio)} — ${NOMBRE_LOCAL}`,
    titulo: 'Tu cita es mañana',
    cuerpo: `
      <p style="margin:0 0 14px;">Hola <strong>${escapar(pila(d.cliente_nombre))}</strong>, te recordamos tu cita de mañana.</p>
      ${ficha(d)}
      <p style="margin:0 0 12px;">Trae <strong>${escapar(soles(saldo))}</strong> para el saldo. El adelanto ya está pagado.</p>
      <p style="margin:0;color:${GRIS};font-size:13px;">¿No puedes venir? Avísanos por WhatsApp y lo movemos.</p>`,
  })
}

/** 4 · Rechazo del comprobante: vuelve a pendiente con 30 minutos más. */
export async function enviarRechazo(d: DatosCorreo): Promise<ResultadoEnvio> {
  return enviar(d, {
    asunto: `No pudimos validar tu comprobante — ${d.codigo}`,
    titulo: 'Revisa tu comprobante',
    cuerpo: `
      <p style="margin:0 0 14px;">Hola <strong>${escapar(pila(d.cliente_nombre))}</strong>: no pudimos validar la captura del adelanto.</p>
      ${d.motivo ? `<p style="margin:0 0 14px;padding:12px 14px;background:#FDF0EE;border-left:3px solid #C7584F;border-radius:0 8px 8px 0;"><strong>Motivo:</strong> ${escapar(d.motivo)}</p>` : ''}
      ${ficha(d)}
      <p style="margin:0 0 14px;">Te guardamos el horario <strong>30 minutos más</strong>. Escríbenos por WhatsApp con tu código <strong>${escapar(d.codigo)}</strong> y te pasamos el enlace para subir otra captura, o vuelve a reservar desde la web.</p>
      <p style="margin:0;"><a href="${urlSitio()}" style="display:inline-block;background:${TINTA};color:${HUESO};text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">Ir a la web</a></p>`,
  })
}

// ── Motor de envío ────────────────────────────────────────────────────────────

interface Plantilla {
  asunto: string
  titulo: string
  cuerpo: string
}

async function enviar(
  d: DatosCorreo,
  p: Plantilla,
  adjuntos?: { filename: string; content: string }[],
): Promise<ResultadoEnvio> {
  if (!d.cliente_email) {
    return { ok: false, error: 'El cliente no dejó correo' }
  }
  if (!emailConfigurado()) {
    console.warn(`[email] sin configurar; no se envía "${p.asunto}" a ${d.cliente_email}`)
    return { ok: false, error: 'El correo no está configurado' }
  }

  const de = remitente()!
  if (!remitenteValido(de)) {
    const error =
      `El remitente no tiene forma de correo: ${JSON.stringify(de)}. Debe ser ` +
      '"correo@dominio" o "Nombre <correo@dominio>", SIN comillas alrededor. ' +
      'Si lo pegaste en el panel de Vercel, quítaselas allí.'
    console.error('[email]', error)
    return { ok: false, error }
  }

  const html = envoltorio(p.titulo, p.cuerpo)

  try {
    if (proveedor() === 'brevo') {
      return await enviarPorBrevo(de, d.cliente_email, p.asunto, html, adjuntos)
    }

    const r = await resend().emails.send({
      from: de,
      to: d.cliente_email,
      subject: p.asunto,
      html,
      ...(adjuntos ? { attachments: adjuntos } : {}),
    })
    if (r.error) return { ok: false, error: r.error.message }
    return { ok: true, id: r.data?.id }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[email] fallo al enviar', error)
    return { ok: false, error }
  }
}

/**
 * Brevo por HTTP, sin SDK.
 *
 * El adjunto ya viene en base64 desde `enviarConfirmacion()`, que es justo lo
 * que Brevo pide en `attachment[].content`. Resend usa la misma codificación,
 * así que el .ics no hay que tocarlo.
 *
 * Brevo devuelve 2xx con `{ messageId }`. En un error, el cuerpo trae
 * `{ code, message }`; se propaga tal cual para que quede en `notificaciones`
 * y se pueda leer después — el fallo de las comillas se encontró así.
 */
async function enviarPorBrevo(
  de: string,
  para: string,
  asunto: string,
  html: string,
  adjuntos?: { filename: string; content: string }[],
): Promise<ResultadoEnvio> {
  const { nombre, correo } = partirRemitente(de)

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': requerida('BREVO_API_KEY'),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: nombre ? { name: nombre, email: correo } : { email: correo },
      to: [{ email: para }],
      subject: asunto,
      htmlContent: html,
      ...(adjuntos
        ? { attachment: adjuntos.map((a) => ({ name: a.filename, content: a.content })) }
        : {}),
    }),
  })

  const cuerpo = (await r.json().catch(() => null)) as
    | { messageId?: string; code?: string; message?: string }
    | null

  if (!r.ok) {
    const error = cuerpo?.message
      ? `Brevo ${r.status}: ${cuerpo.message}`
      : `Brevo respondió ${r.status}`
    console.error('[email]', error)
    return { ok: false, error }
  }

  return { ok: true, id: cuerpo?.messageId }
}

// ── Utilidades ────────────────────────────────────────────────────────────────

/** Escapa HTML. Todo lo que viene del cliente pasa por aquí. */
function escapar(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const pila = (n: string) => (n.trim().split(/\s+/)[0] ?? n).trim()
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
