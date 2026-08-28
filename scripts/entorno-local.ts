import { existsSync, readFileSync } from 'node:fs'

/**
 * Carga .env.local en process.env si el archivo existe.
 *
 * En GitHub Actions no existe —las variables llegan de los secrets— así que
 * esto es un no-op allí. Sirve para poder lanzar los crons a mano en local
 * (`npm run cron:liberar`) sin exportar nada primero.
 *
 * Nunca pisa una variable que ya venga del entorno: los secrets del CI mandan.
 */
export function cargarEntornoLocal(archivo = '.env.local'): void {
  if (!existsSync(archivo)) return

  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const l = linea.trim()
    if (!l || l.startsWith('#')) continue

    const i = l.indexOf('=')
    if (i < 1) continue

    const clave = l.slice(0, i).trim()
    let valor = l.slice(i + 1).trim()

    // Quita comillas envolventes si las hay.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }

    if (valor && process.env[clave] === undefined) process.env[clave] = valor
  }
}

cargarEntornoLocal()
