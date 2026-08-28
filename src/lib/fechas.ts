/**
 * Todo el negocio ocurre en America/Lima (UTC-5 fijo, sin horario de verano
 * desde 1994). En la base todo es timestamptz; aquí sólo se FORMATEA para
 * mostrar. Nunca se hace aritmética de husos a mano.
 */

export const ZONA = 'America/Lima'

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, ...opts })

const aDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v))

/** "16:30" */
export function hora(v: Date | string): string {
  return fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(aDate(v))
}

/** "4:30 p. m." — para textos dirigidos al cliente, que lee en 12 h. */
export function hora12(v: Date | string): string {
  return fmt({ hour: 'numeric', minute: '2-digit', hour12: true })
    .format(aDate(v))
    .replace(/\s/g, ' ')
}

/** "lun 31" */
export function fechaCorta(v: Date | string): string {
  return fmt({ weekday: 'short', day: 'numeric' }).format(aDate(v)).replace('.', '')
}

/** "lunes 31 de agosto" */
export function fechaLarga(v: Date | string): string {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(aDate(v))
}

/** "lunes 31 de agosto, 4:30 p. m." */
export function fechaHoraLarga(v: Date | string): string {
  return `${fechaLarga(v)}, ${hora12(v)}`
}

/** "2026-08-31" en hora de Lima — el formato que espera la RPC. */
export function fechaISO(v: Date | string): string {
  const p = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(aDate(v))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** Día de la semana en Lima: 0 domingo … 6 sábado (igual que EXTRACT(dow)). */
export function diaSemana(v: Date | string): number {
  const nombre = fmt({ weekday: 'short' }).format(aDate(v)).toLowerCase()
  const orden = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const i = orden.findIndex((d) => nombre.startsWith(d))
  return i === -1 ? 0 : i
}

export interface DiaOfrecido {
  iso: string // 2026-08-31
  diaSemana: string // "lun"
  diaMes: string // "31"
  mes: string // "ago"
  esHoy: boolean
  esManana: boolean
}

/**
 * Los próximos N días a partir de hoy (hora de Lima), para la franja
 * horizontal del selector de día.
 */
export function proximosDias(n = 14, desde: Date = new Date()): DiaOfrecido[] {
  const hoyISO = fechaISO(desde)
  const dias: DiaOfrecido[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(desde.getTime() + i * 86_400_000)
    dias.push({
      iso: fechaISO(d),
      diaSemana: fmt({ weekday: 'short' }).format(d).replace('.', ''),
      diaMes: fmt({ day: 'numeric' }).format(d),
      mes: fmt({ month: 'short' }).format(d).replace('.', ''),
      esHoy: fechaISO(d) === hoyISO,
      esManana: i === 1,
    })
  }
  return dias
}

/** Mañana en Lima, en ISO corto. Lo usa el cron de recordatorios. */
export function mananaISO(desde: Date = new Date()): string {
  return fechaISO(new Date(desde.getTime() + 86_400_000))
}

/**
 * Límites [inicio, fin) de un día de Lima, como instantes UTC.
 * Lima es UTC-5 fijo, así que el desfase es constante — pero se calcula, no
 * se cablea, por si algún día cambia la ley.
 */
export function limitesDelDia(iso: string): { desde: string; hasta: string } {
  const desde = new Date(`${iso}T00:00:00${desfaseLima(iso)}`)
  const hasta = new Date(desde.getTime() + 86_400_000)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

/** "-05:00" — el desfase real de Lima en esa fecha, leído del sistema de husos. */
function desfaseLima(iso: string): string {
  const ref = new Date(`${iso}T12:00:00Z`)
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    timeZoneName: 'longOffset',
  }).formatToParts(ref)
  const tz = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-05:00'
  return tz.replace('GMT', '') || '-05:00'
}

/** "S/ 35.00" a partir de céntimos. Nunca se hace aritmética con floats. */
export function soles(centimos: number): string {
  return `S/ ${(centimos / 100).toFixed(2)}`
}

/** mm:ss para el cronómetro de los 15 minutos. */
export function cuentaAtras(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
