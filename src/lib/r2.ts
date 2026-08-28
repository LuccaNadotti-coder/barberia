import { createHash, createHmac, randomUUID } from 'node:crypto'
import { opcional, requerida } from './entorno'
import { EXTENSION_POR_TIPO, type TipoImagen } from './validacion'

/**
 * Cloudflare R2 — firmado AWS Signature V4 a mano.
 *
 * Por qué a mano y no con @aws-sdk/client-s3: el SDK son ~15 MB y decenas de
 * paquetes para lo único que necesitamos, que son dos operaciones (PUT de un
 * objeto y GET prefirmado). SigV4 son 60 líneas de HMAC. En una función
 * serverless, el arranque en frío se nota.
 *
 * El bucket es PRIVADO. Nunca se sirve una URL pública: las capturas de pago
 * llevan el nombre y el número de operación de una persona. Sólo se generan
 * URLs firmadas de 5 minutos, y sólo para un barbero con sesión.
 */

const ALGORITMO = 'AWS4-HMAC-SHA256'
const REGION = 'auto' // R2 siempre usa "auto"
const SERVICIO = 's3'
const SIN_FIRMAR = 'UNSIGNED-PAYLOAD'

interface ConfigR2 {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  host: string
}

/** Perezosa: `next build` no debe caerse por falta de secretos. */
function config(): ConfigR2 {
  const accountId = requerida('R2_ACCOUNT_ID')
  return {
    accountId,
    accessKeyId: requerida('R2_ACCESS_KEY_ID'),
    secretAccessKey: requerida('R2_SECRET_ACCESS_KEY'),
    bucket: requerida('R2_BUCKET'),
    host: `${accountId}.r2.cloudflarestorage.com`,
  }
}

export function r2Configurado(): boolean {
  return Boolean(
    opcional('R2_ACCOUNT_ID') &&
      opcional('R2_ACCESS_KEY_ID') &&
      opcional('R2_SECRET_ACCESS_KEY') &&
      opcional('R2_BUCKET'),
  )
}

// ── Primitivas ────────────────────────────────────────────────────────────────

const sha256hex = (d: string | Uint8Array) => createHash('sha256').update(d).digest('hex')
const hmac = (clave: Uint8Array | string, dato: string) =>
  createHmac('sha256', clave).update(dato, 'utf8').digest()

/**
 * RFC 3986. encodeURIComponent deja sin escapar ! ' ( ) * , que SigV4 sí
 * exige escapar. Si no se hace, la firma no cuadra y R2 devuelve 403.
 */
function encodeRFC3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** La ruta se codifica por segmentos: las barras se conservan. */
const encodeRuta = (ruta: string) => ruta.split('/').map(encodeRFC3986).join('/')

/** 20260827T181805Z y 20260827 */
function sellos(d = new Date()): { amz: string; corto: string } {
  const amz = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { amz, corto: amz.slice(0, 8) }
}

function claveDeFirma(secreto: string, corto: string): Buffer {
  const kDate = hmac(`AWS4${secreto}`, corto)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICIO)
  return hmac(kService, 'aws4_request')
}

// ── Nombres de objeto ─────────────────────────────────────────────────────────

/**
 * El nombre lo genera SIEMPRE el servidor. Nunca el que manda el usuario:
 * `../../etc/passwd`, nombres de 4 KB, colisiones a propósito, y de paso el
 * nombre original filtra datos ("captura-yape-juan-perez.jpg").
 */
export function generarClaveCaptura(tipo: TipoImagen, codigoCita: string): string {
  const ahora = new Date()
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  return `capturas/${anio}/${mes}/${codigoCita}-${randomUUID()}.${EXTENSION_POR_TIPO[tipo]}`
}

// ── Subida ────────────────────────────────────────────────────────────────────

/**
 * PUT del objeto con la firma en la cabecera Authorization.
 * Devuelve la clave, que es lo único que se guarda en `citas.captura_path`.
 */
export async function subirObjeto(
  clave: string,
  cuerpo: Uint8Array,
  contentType: string,
): Promise<string> {
  const c = config()
  const { amz, corto } = sellos()
  const ruta = `/${c.bucket}/${encodeRuta(clave)}`
  const hashCuerpo = sha256hex(cuerpo)

  const cabeceras: Record<string, string> = {
    host: c.host,
    'content-length': String(cuerpo.byteLength),
    'content-type': contentType,
    'x-amz-content-sha256': hashCuerpo,
    'x-amz-date': amz,
  }

  const nombres = Object.keys(cabeceras).sort()
  const canonicas = nombres.map((n) => `${n}:${cabeceras[n]!.trim()}\n`).join('')
  const firmadas = nombres.join(';')

  const peticionCanonica = [
    'PUT',
    ruta,
    '', // sin query
    canonicas,
    firmadas,
    hashCuerpo,
  ].join('\n')

  const alcance = `${corto}/${REGION}/${SERVICIO}/aws4_request`
  const paraFirmar = [ALGORITMO, amz, alcance, sha256hex(peticionCanonica)].join('\n')
  const firma = createHmac('sha256', claveDeFirma(c.secretAccessKey, corto))
    .update(paraFirmar, 'utf8')
    .digest('hex')

  const r = await fetch(`https://${c.host}${ruta}`, {
    method: 'PUT',
    // Uint8Array es un BodyInit válido; el cast evita el ruido de tipos de
    // ArrayBufferLike en el DOM lib.
    body: cuerpo as unknown as BodyInit,
    headers: {
      ...cabeceras,
      Authorization: `${ALGORITMO} Credential=${c.accessKeyId}/${alcance}, SignedHeaders=${firmadas}, Signature=${firma}`,
    },
  })

  if (!r.ok) {
    const detalle = await r.text().catch(() => '')
    throw new Error(`R2 rechazó la subida (${r.status}): ${detalle.slice(0, 300)}`)
  }
  return clave
}

// ── Lectura firmada ───────────────────────────────────────────────────────────

/**
 * URL prefirmada de LECTURA, válida por unos pocos minutos.
 *
 * Se genera una por cada vez que el panel pinta una captura. Si alguien copia
 * el enlace, caduca solo. Nunca se guarda en base de datos ni se manda por
 * correo.
 */
export function urlFirmadaLectura(clave: string, segundos = 300): string {
  const c = config()
  const { amz, corto } = sellos()
  const ruta = `/${c.bucket}/${encodeRuta(clave)}`
  const alcance = `${corto}/${REGION}/${SERVICIO}/aws4_request`

  // Los parámetros van ordenados alfabéticamente y ya codificados.
  const query = new URLSearchParams()
  query.set('X-Amz-Algorithm', ALGORITMO)
  query.set('X-Amz-Credential', `${c.accessKeyId}/${alcance}`)
  query.set('X-Amz-Date', amz)
  query.set('X-Amz-Expires', String(Math.min(Math.max(segundos, 1), 604800)))
  query.set('X-Amz-SignedHeaders', 'host')

  const canonicaQuery = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeRFC3986(k)}=${encodeRFC3986(v)}`)
    .join('&')

  const peticionCanonica = [
    'GET',
    ruta,
    canonicaQuery,
    `host:${c.host}\n`,
    'host',
    SIN_FIRMAR,
  ].join('\n')

  const paraFirmar = [ALGORITMO, amz, alcance, sha256hex(peticionCanonica)].join('\n')
  const firma = createHmac('sha256', claveDeFirma(c.secretAccessKey, corto))
    .update(paraFirmar, 'utf8')
    .digest('hex')

  return `https://${c.host}${ruta}?${canonicaQuery}&X-Amz-Signature=${firma}`
}

/** Varias a la vez, para la lista "Por validar" del panel. */
export function urlsFirmadas(claves: (string | null)[], segundos = 300): (string | null)[] {
  if (!r2Configurado()) return claves.map(() => null)
  return claves.map((k) => {
    if (!k) return null
    try {
      return urlFirmadaLectura(k, segundos)
    } catch {
      return null
    }
  })
}
