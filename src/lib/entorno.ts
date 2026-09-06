/**
 * Acceso a variables de entorno. **SÓLO PARA CÓDIGO DE SERVIDOR.**
 *
 * Se leen PEREZOSAMENTE (dentro de una función, nunca en el cuerpo del módulo).
 * Si se leyeran al importar, `next build` reventaría en CI —donde no hay
 * secretos— sólo por analizar el árbol de imports.
 *
 * ⚠️ NO USES ESTO EN UN COMPONENTE 'use client'.
 *
 * Estas funciones acceden con clave DINÁMICA (`process.env[nombre]`). Next
 * sólo sustituye las variables `NEXT_PUBLIC_` en el bundle del navegador
 * cuando la propiedad se escribe LITERAL (`process.env.NEXT_PUBLIC_ALGO`).
 * Con una clave dinámica no hay nada que sustituir: en el navegador
 * `process.env` llega vacío y `requerida()` lanza siempre.
 *
 * En el navegador, lee la variable a mano con su literal. Ejemplo hecho:
 * `src/lib/sesion-navegador.ts`.
 */

/**
 * Quita las comillas que envuelven el valor, si las hay.
 *
 * En un archivo `.env`, `CLAVE="valor con espacios"` es la forma normal de
 * escribirlo y dotenv quita las comillas al leerlo. En el panel de Vercel NO:
 * ahí el valor es literalmente lo que pegas, comillas incluidas. Copiar una
 * línea del `.env.local` al dashboard mete las comillas en el valor.
 *
 * Nos costó el 100 % de los correos en producción. `RESEND_FROM` valía
 * `"Barbería <onboarding@resend.dev>"` con comillas y Resend respondía
 * «Invalid `from` field» en cada envío. En local no se veía, porque ahí sí las
 * quita dotenv: fallaba **sólo** en producción, y en silencio — el fallo se
 * anotaba en `notificaciones` y la reserva seguía adelante como si nada.
 */
function sinComillas(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1)
  }
  return t
}

/** Variable obligatoria: si falta, se cae con un mensaje que dice cuál. */
export function requerida(nombre: string): string {
  const v = process.env[nombre]
  if (!v || v.length === 0) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Revisa .env.local (mira .env.example).`,
    )
  }
  return sinComillas(v)
}

/** Variable opcional: devuelve undefined en lugar de reventar. */
export function opcional(nombre: string): string | undefined {
  const v = process.env[nombre]
  if (!v || v.length === 0) return undefined
  const limpio = sinComillas(v)
  return limpio.length > 0 ? limpio : undefined
}

/** Expuesta sólo para las pruebas de `pruebas/lib.mjs`. */
export const _sinComillas = sinComillas

/** URL pública del sitio, sin barra final. Se usa en correos y en el .ics. */
export function urlSitio(): string {
  const v =
    opcional('NEXT_PUBLIC_URL_SITIO') ??
    (opcional('VERCEL_URL') ? `https://${opcional('VERCEL_URL')}` : undefined) ??
    'http://localhost:3000'
  return v.replace(/\/+$/, '')
}
