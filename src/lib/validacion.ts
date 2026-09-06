import { z } from 'zod'
import { opcional, requerida } from './entorno'

// ═══════════════════════════════════════════════════════════════════════════════
//  TELÉFONO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Los celulares peruanos son 9 dígitos y empiezan por 9. Se guardan siempre
 * como 51XXXXXXXXX (E.164 sin '+') porque es el formato que necesita wa.me.
 *
 * Acepta lo que la gente escribe de verdad: "987 654 321", "+51 987-654-321",
 * "051987654321".
 */
export function normalizarTelefono(entrada: string): string | null {
  let d = (entrada ?? '').replace(/\D/g, '')

  if (d.startsWith('0051')) d = d.slice(4)
  else if (d.startsWith('051')) d = d.slice(3)

  if (d.length === 9 && d.startsWith('9')) return `51${d}`
  if (d.length === 11 && d.startsWith('51') && d[2] === '9') return d

  return null
}

/** "987 654 321" — para mostrar, nunca para guardar. */
export function telefonoLegible(e164: string): string {
  const d = e164.replace(/^51/, '')
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ESQUEMAS ZOD
// ═══════════════════════════════════════════════════════════════════════════════

const uuid = z.string().uuid('Identificador inválido')

/** Celular normalizado a 51XXXXXXXXX. Lo usan la reserva y la recuperación. */
const campoTelefono = z.string().transform((v, ctx) => {
  const n = normalizarTelefono(v)
  if (!n) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Celular inválido. Debe tener 9 dígitos y empezar por 9.',
    })
    return z.NEVER
  }
  return n
})

/** El código que se imprime en el ticket: BR- y 5 caracteres sin ambigüedad. */
const campoCodigo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^BR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/,
    'El código tiene la forma BR-XXXXX. Míralo en tu ticket.',
  )

export const esquemaDisponibilidad = z.object({
  barbero_id: uuid,
  servicio_id: uuid,
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser YYYY-MM-DD')
    .refine((f) => !Number.isNaN(Date.parse(`${f}T12:00:00Z`)), 'Fecha inexistente'),
})
export type EntradaDisponibilidad = z.infer<typeof esquemaDisponibilidad>

/**
 * OJO: aquí NO hay campo `precio`, ni `adelanto`, ni `estado`. El precio lo
 * congela crear_reserva() leyendo la tabla `servicios`. Si algún día alguien
 * añade `precio` a este esquema, ha roto la regla más importante del sistema.
 */
export const esquemaReserva = z.object({
  servicio_id: uuid,
  barbero_id: uuid,
  inicio: z
    .string()
    .datetime({ offset: true, message: 'La hora debe ser ISO 8601 con huso' }),
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'Nombre demasiado largo')
    .regex(/^[\p{L}\p{M}' .-]+$/u, 'El nombre sólo admite letras'),
  telefono: campoTelefono,
  email: z
    .string()
    .trim()
    .email('Correo inválido')
    .max(120)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notas: z.string().trim().max(300).optional(),
  turnstile: z.string().min(1, 'Falta la verificación anti-bots').optional(),
})
export type EntradaReserva = z.infer<typeof esquemaReserva>

export const esquemaCaptura = z.object({
  cita_id: uuid,
  codigo: campoCodigo,
})

/**
 * Recuperar una reserva ya creada. Dos factores: el código del ticket y el
 * celular con el que se reservó. Turnstile va aparte, en la ruta, para que un
 * script no pueda iterar códigos.
 */
export const esquemaBuscarCita = z.object({
  codigo: campoCodigo,
  telefono: campoTelefono,
  turnstile: z.string().min(1, 'Falta la verificación anti-bots').optional(),
})

export const esquemaValidar = z.object({
  cita_id: uuid,
  accion: z.enum(['confirmar', 'rechazar', 'atendida', 'no_show', 'cancelar']),
  motivo: z.string().trim().max(200).optional(),
  referencia: z.string().trim().max(60).optional(),
})
export type EntradaValidar = z.infer<typeof esquemaValidar>

// ═══════════════════════════════════════════════════════════════════════════════
//  IMÁGENES — validación por MAGIC BYTES
// ═══════════════════════════════════════════════════════════════════════════════

export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * Mira los primeros bytes del archivo, NO la extensión ni el Content-Type:
 * ambos los controla el atacante. Un `.jpg` que en realidad es un .php o un
 * SVG con <script> se cuela si sólo miras el nombre.
 *
 *   JPEG  FF D8 FF
 *   PNG   89 50 4E 47 0D 0A 1A 0A
 *   WEBP  52 49 46 46 ?? ?? ?? ?? 57 45 42 50   ("RIFF" … "WEBP")
 */
export function esImagenReal(buf: Uint8Array): TipoImagen | null {
  if (buf.length < 12) return null

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((b, i) => buf[i] === b)) return 'image/png'

  const riff = [0x52, 0x49, 0x46, 0x46]
  const webp = [0x57, 0x45, 0x42, 0x50]
  if (riff.every((b, i) => buf[i] === b) && webp.every((b, i) => buf[8 + i] === b)) {
    return 'image/webp'
  }

  return null
}

export const MAX_CAPTURA_BYTES = 5 * 1024 * 1024 // 5 MB

export const EXTENSION_POR_TIPO: Record<TipoImagen, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TURNSTILE (Cloudflare, capa gratuita)
// ═══════════════════════════════════════════════════════════════════════════════

const URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifica el token del widget contra Cloudflare.
 *
 * Si TURNSTILE_SECRET_KEY no está configurada, devuelve true: así el proyecto
 * arranca en local sin cuenta de Cloudflare. En producción configúrala —
 * sin ella, el endpoint de reservar queda abierto a bots.
 */
export async function verificarTurnstile(
  token: string | undefined,
  ip?: string,
): Promise<boolean> {
  const secreto = opcional('TURNSTILE_SECRET_KEY')
  if (!secreto) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY sin configurar: verificación desactivada.')
    }
    return true
  }
  if (!token) return false

  const cuerpo = new URLSearchParams({ secret: secreto, response: token })
  if (ip) cuerpo.set('remoteip', ip)

  try {
    const r = await fetch(URL_TURNSTILE, {
      method: 'POST',
      body: cuerpo,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const j = (await r.json()) as { success?: boolean }
    return j.success === true
  } catch (e) {
    console.error('[turnstile] no se pudo verificar', e)
    return false
  }
}

/** La clave pública del widget. Vacía = el widget no se pinta. */
export function claveSitioTurnstile(): string | undefined {
  return opcional('NEXT_PUBLIC_TURNSTILE_SITE_KEY')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ERRORES DE POSTGRES → MENSAJE PARA EL CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ErrorPostgres {
  code?: string
  message?: string
  details?: string
  hint?: string
}

/**
 * Traduce lo que devuelve la RPC a (mensaje, código HTTP).
 *
 *   23P01 exclusion_violation      → 409, el slot se lo llevó otro
 *   22023 invalid_parameter_value  → 400, datos inválidos con mensaje propio
 */
export function traducirErrorRpc(e: ErrorPostgres | null): { mensaje: string; http: number } {
  if (!e) return { mensaje: 'Error desconocido', http: 500 }

  const limpio = (e.message ?? '').replace(/^ERROR:\s*/i, '').split('\n')[0] ?? ''

  if (e.code === '23P01') {
    return { mensaje: limpio || 'Ese horario acaba de ser tomado.', http: 409 }
  }
  if (e.code === '22023' || e.code === 'P0001') {
    return { mensaje: limpio || 'Datos inválidos', http: 400 }
  }
  if (e.code === '42501') {
    return { mensaje: 'No tienes permiso para esta operación', http: 403 }
  }

  console.error('[rpc] error no previsto', e)
  return { mensaje: 'No se pudo completar la operación. Inténtalo de nuevo.', http: 500 }
}

/** Errores de Zod → un objeto {campo: mensaje} que el formulario pinta. */
export function erroresDeZod(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of e.issues) {
    const k = i.path.join('.') || '_'
    if (!out[k]) out[k] = i.message
  }
  return out
}

/** IP del cliente detrás del proxy (Vercel / Cloudflare). */
export function ipDe(req: Request): string | undefined {
  const h = req.headers
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  )
}

/** Sólo para asegurar que TURNSTILE_SECRET_KEY existe en producción. */
export function exigirTurnstileEnProduccion(): void {
  if (process.env.NODE_ENV === 'production') requerida('TURNSTILE_SECRET_KEY')
}
