/**
 * Generador de archivos .ics (RFC 5545) sin dependencias.
 *
 * Va adjunto en el correo de confirmación: el cliente lo toca y la cita entra
 * en su calendario, con una alarma 2 horas antes. Es la diferencia entre
 * "me acuerdo" y "no vino".
 */

import { ZONA } from './fechas'

export interface DatosICS {
  uid: string // id de la cita
  codigo: string
  inicio: string | Date
  fin: string | Date
  servicio: string
  barbero: string
  local: string
  direccion?: string
  notas?: string
  url?: string
  /** Marca de creación/actualización; por defecto, ahora. */
  sello?: Date
}

/** UTC compacto: 20260831T210000Z */
function utc(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v)
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/**
 * Escapa según RFC 5545 §3.3.11: coma, punto y coma, barra invertida y saltos
 * de línea. Si no se hace, un servicio con coma en el nombre rompe el archivo.
 */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Plegado de líneas: RFC 5545 exige máximo 75 octetos por línea; las
 * continuaciones empiezan con un espacio. Se cuenta en BYTES, no en
 * caracteres: "ñ" y los emojis ocupan más de uno.
 */
function plegar(linea: string): string {
  const bytes = Buffer.from(linea, 'utf8')
  if (bytes.length <= 75) return linea

  const trozos: string[] = []
  let ini = 0
  let limite = 75
  while (ini < bytes.length) {
    let fin = Math.min(ini + limite, bytes.length)
    // No partir a mitad de un carácter multibyte.
    while (fin > ini && fin < bytes.length && (bytes[fin]! & 0xc0) === 0x80) fin--
    trozos.push(bytes.subarray(ini, fin).toString('utf8'))
    ini = fin
    limite = 74 // las siguientes llevan un espacio inicial
  }
  return trozos.join('\r\n ')
}

export function generarICS(d: DatosICS): string {
  const sello = d.sello ?? new Date()
  const dominio = (process.env.NEXT_PUBLIC_URL_SITIO ?? 'barberia.local')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

  const descripcion = [
    `Reserva ${d.codigo}`,
    `Servicio: ${d.servicio}`,
    `Barbero: ${d.barbero}`,
    d.notas,
    d.url ? `Detalle: ${d.url}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(d.local)}//Reservas//ES`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${d.uid}@${dominio}`,
    `DTSTAMP:${utc(sello)}`,
    `DTSTART:${utc(d.inicio)}`,
    `DTEND:${utc(d.fin)}`,
    `SUMMARY:${esc(`${d.servicio} — ${d.local}`)}`,
    `DESCRIPTION:${esc(descripcion)}`,
    d.direccion ? `LOCATION:${esc(d.direccion)}` : `LOCATION:${esc(d.local)}`,
    d.url ? `URL:${esc(d.url)}` : undefined,
    `X-WR-TIMEZONE:${ZONA}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    // Alarma 2 horas antes.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Tu cita en ${d.local} es en 2 horas`)}`,
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => typeof l === 'string')

  // CRLF obligatorio por RFC.
  return lineas.map(plegar).join('\r\n') + '\r\n'
}

/** Nombre de archivo sugerido para el adjunto. */
export function nombreICS(codigo: string): string {
  return `cita-${codigo}.ics`
}
