/**
 * WhatsApp SEMIAUTOMÁTICO — decisión de negocio, no limitación técnica.
 *
 * Aquí NO hay API de WhatsApp. Ni Cloud API, ni Baileys, ni ningún puente no
 * oficial. Este módulo sólo construye enlaces wa.me con el texto ya escrito;
 * el barbero toca el botón y su propio WhatsApp abre el chat con el mensaje
 * listo para enviar.
 *
 * Por qué:
 *   · Cuesta $0. La Cloud API cobra por conversación iniciada por el negocio.
 *   · No hay riesgo de que baneen el número: los envíos salen del móvil real.
 *   · El barbero relee antes de mandar, y a veces edita. Es su cliente.
 *
 * Si algún día se quiere automatizar de verdad, es un cambio consciente:
 * hay que pedirlo explícitamente. No lo introduzcas "de paso".
 */

import { fechaLarga, hora12, soles } from './fechas'

const NOMBRE_LOCAL = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'la barbería'

/** Enlace wa.me con el mensaje precargado. `telefono` en formato 51XXXXXXXXX. */
export function enlaceWhatsApp(telefono: string, mensaje: string): string {
  return `https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`
}

export interface DatosMensaje {
  cliente_nombre: string
  servicio_nombre: string
  barbero_nombre: string
  inicio: string
  codigo: string
  adelanto_centimos?: number
  precio_centimos?: number
  motivo?: string
}

/** Primer nombre, que es como se habla por WhatsApp. */
const pila = (n: string) => (n.trim().split(/\s+/)[0] ?? n).trim()

/** Recordatorio del día anterior. Es el mensaje que más se usa. */
export function mensajeRecordatorio(d: DatosMensaje): string {
  const saldo =
    d.precio_centimos !== undefined && d.adelanto_centimos !== undefined
      ? `\nSaldo a pagar en el local: ${soles(d.precio_centimos - d.adelanto_centimos)}.`
      : ''
  return (
    `Hola ${pila(d.cliente_nombre)} 👋 Te escribo de ${NOMBRE_LOCAL}.\n\n` +
    `Te recuerdo tu cita de mañana:\n` +
    `🗓️ ${fechaLarga(d.inicio)} a las ${hora12(d.inicio)}\n` +
    `✂️ ${d.servicio_nombre} con ${d.barbero_nombre}\n` +
    `🎫 Código ${d.codigo}${saldo}\n\n` +
    `Si no puedes venir, avísame por aquí y lo movemos. ¡Nos vemos!`
  )
}

/** Aviso de confirmación, cuando el barbero valida el adelanto. */
export function mensajeConfirmacion(d: DatosMensaje): string {
  return (
    `¡Listo ${pila(d.cliente_nombre)}! ✅ Tu adelanto quedó confirmado.\n\n` +
    `🗓️ ${fechaLarga(d.inicio)} a las ${hora12(d.inicio)}\n` +
    `✂️ ${d.servicio_nombre} con ${d.barbero_nombre}\n` +
    `🎫 Código ${d.codigo}\n\n` +
    `Te esperamos en ${NOMBRE_LOCAL}. Si necesitas moverla, escríbeme.`
  )
}

/** Cuando la captura no cuadra y se devuelve a pendiente de pago. */
export function mensajeRechazo(d: DatosMensaje): string {
  const motivo = d.motivo ? `\nMotivo: ${d.motivo}` : ''
  return (
    `Hola ${pila(d.cliente_nombre)}, soy de ${NOMBRE_LOCAL}.\n\n` +
    `No pude validar la captura del adelanto de tu cita ${d.codigo} ` +
    `(${fechaLarga(d.inicio)}, ${hora12(d.inicio)}).${motivo}\n\n` +
    `Te reservé el horario 30 minutos más para que subas una captura nueva. ` +
    `Si prefieres, mándamela por aquí y la reviso.`
  )
}

/** Seguimiento a quien no vino. El adelanto no se devuelve. */
export function mensajeNoShow(d: DatosMensaje): string {
  return (
    `Hola ${pila(d.cliente_nombre)}, te esperamos hoy a las ${hora12(d.inicio)} ` +
    `y no llegaste. ¿Todo bien?\n\n` +
    `Cuando quieras reagendar, escríbeme y te busco un espacio.`
  )
}

/** Mensaje libre: abre el chat sin texto, para hablar de lo que sea. */
export function mensajeLibre(d: Pick<DatosMensaje, 'cliente_nombre' | 'codigo'>): string {
  return `Hola ${pila(d.cliente_nombre)}, te escribo de ${NOMBRE_LOCAL} por tu reserva ${d.codigo}.`
}

export type PlantillaWhatsApp = 'recordatorio' | 'confirmacion' | 'rechazo' | 'no_show' | 'libre'

/** Devuelve el enlace listo para un `<a href>` en el panel. */
export function enlacePara(
  plantilla: PlantillaWhatsApp,
  telefono: string,
  datos: DatosMensaje,
): string {
  const texto =
    plantilla === 'recordatorio'
      ? mensajeRecordatorio(datos)
      : plantilla === 'confirmacion'
        ? mensajeConfirmacion(datos)
        : plantilla === 'rechazo'
          ? mensajeRechazo(datos)
          : plantilla === 'no_show'
            ? mensajeNoShow(datos)
            : mensajeLibre(datos)
  return enlaceWhatsApp(telefono, texto)
}
