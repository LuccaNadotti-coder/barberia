/**
 * CRON · día 1 de cada mes
 *
 * Exporta citas, pagos y clientes a CSV y los mete en un ZIP CIFRADO CON
 * CONTRASEÑA (AES-256).
 *
 * El cifrado no es opcional: el archivo lleva nombres, teléfonos y correos de
 * personas. En Perú eso es dato personal bajo la Ley 29733 de Protección de
 * Datos Personales, y su reglamento exige medidas de seguridad para el
 * almacenamiento y la transferencia. Un ZIP sin contraseña en Google Drive no
 * las cumple.
 *
 * El script deja el ZIP en ./respaldos/. La subida a Drive queda fuera a
 * propósito: hacerla desde el cron obligaría a guardar credenciales de Google
 * con permiso de escritura. El workflow lo publica como artefacto de GitHub
 * Actions y tú lo bajas y lo subes a Drive.
 */

import './entorno-local' // no-op en CI; en local carga .env.local
import { createClient } from '@supabase/supabase-js'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * archiver y archiver-zip-encrypted son CommonJS y sus tipos publicados no
 * corresponden a la versión que usamos (@types/archiver@8 no declara ni
 * create() ni registerFormat(), que sí existen en archiver@7). En vez de
 * pelearse con la interoperabilidad ESM/CJS, se cargan con createRequire —
 * funciona igual tanto si tsx ejecuta el archivo como CJS o como ESM — y se
 * declara aquí la interfaz mínima que realmente se usa.
 */
interface Archivador {
  pipe(destino: NodeJS.WritableStream): void
  append(fuente: string | Buffer, opciones: { name: string }): void
  finalize(): Promise<void>
  on(evento: string, cb: (e: unknown) => void): void
}

interface FabricaArchiver {
  registerFormat(nombre: string, modulo: unknown): void
  create(formato: string, opciones: Record<string, unknown>): Archivador
}

const requerir = createRequire(join(process.cwd(), 'package.json'))

function requerida(n: string): string {
  const v = process.env[n]
  if (!v) {
    console.error(`Falta la variable de entorno ${n}`)
    process.exit(1)
  }
  return v
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/**
 * Escapado RFC 4180. Además, si el valor empieza por = + - o @, se le antepone
 * una comilla simple: Excel interpretaría `=1+1` como fórmula, y eso es el
 * vector de inyección CSV.
 */
function celda(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function aCSV(filas: Record<string, unknown>[]): string {
  if (filas.length === 0) return ''
  const cols = Object.keys(filas[0]!)
  const cabecera = cols.join(',')
  const cuerpo = filas.map((f) => cols.map((c) => celda(f[c])).join(',')).join('\r\n')
  // BOM para que Excel en Windows abra los acentos bien.
  return `﻿${cabecera}\r\n${cuerpo}\r\n`
}

// ── Descarga paginada ─────────────────────────────────────────────────────────

/** Un solo sitio donde se construye el cliente, para que el tipo cuadre. */
function crearCliente() {
  return createClient(
    requerida('NEXT_PUBLIC_SUPABASE_URL'),
    requerida('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}
type Cliente = ReturnType<typeof crearCliente>

async function volcar(sb: Cliente, tabla: string): Promise<Record<string, unknown>[]> {
  const TAM = 1000
  const todo: Record<string, unknown>[] = []
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await sb
      .from(tabla)
      .select('*')
      .order('creado_en', { ascending: true })
      .range(desde, desde + TAM - 1)

    if (error) throw new Error(`${tabla}: ${error.message}`)
    const lote = (data ?? []) as Record<string, unknown>[]
    todo.push(...lote)
    if (lote.length < TAM) break
  }
  return todo
}

// ── Principal ─────────────────────────────────────────────────────────────────

async function main() {
  const sb = crearCliente()
  const clave = requerida('RESPALDO_PASSWORD')

  const hoy = new Date()
  const sello = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`

  console.log(`[respaldo] generando respaldo ${sello}`)

  const tablas = ['citas', 'pagos', 'clientes'] as const
  const csvs: { nombre: string; contenido: string; filas: number }[] = []

  for (const t of tablas) {
    const filas = await volcar(sb, t)
    csvs.push({ nombre: `${t}.csv`, contenido: aCSV(filas), filas: filas.length })
    console.log(`  · ${t}: ${filas.length} fila(s)`)
  }

  const carpeta = join(process.cwd(), 'respaldos')
  mkdirSync(carpeta, { recursive: true })
  const destino = join(carpeta, `barberia-${sello}.zip`)

  const archiver = requerir('archiver') as FabricaArchiver
  const cifrado = requerir('archiver-zip-encrypted') as unknown

  try {
    archiver.registerFormat('zip-encrypted', cifrado)
  } catch {
    // Ya registrado (puede pasar si el módulo se recarga). No es un error.
  }

  const zip = archiver.create('zip-encrypted', {
    zlib: { level: 9 },
    encryptionMethod: 'aes256',
    password: clave,
  })

  const salida = createWriteStream(destino)
  const terminado = new Promise<void>((resolver, rechazar) => {
    salida.on('close', () => resolver())
    salida.on('error', rechazar)
    zip.on('error', rechazar)
  })

  zip.pipe(salida)

  for (const c of csvs) zip.append(c.contenido, { name: c.nombre })

  zip.append(
    [
      `Respaldo de datos · ${sello}`,
      `Generado: ${hoy.toISOString()}`,
      '',
      ...csvs.map((c) => `${c.nombre}: ${c.filas} filas`),
      '',
      'CONTIENE DATOS PERSONALES (nombres, teléfonos, correos).',
      'Ley 29733 — Protección de Datos Personales (Perú).',
      'Guárdalo cifrado. No lo reenvíes por WhatsApp ni correo sin cifrar.',
      'Consérvalo sólo el tiempo necesario y bórralo cuando deje de hacer falta.',
      '',
      'El ledger de pagos es inmutable: pagos.csv es un registro histórico',
      'completo, incluidas las filas de tipo reembolso (monto negativo).',
    ].join('\n'),
    { name: 'LEEME.txt' },
  )

  await zip.finalize()
  await terminado

  console.log(`[respaldo] listo: ${destino}`)
  console.log('[respaldo] súbelo a Google Drive. La contraseña es RESPALDO_PASSWORD.')
}

main().catch((e) => {
  console.error('[respaldo] fallo:', e)
  process.exit(1)
})
