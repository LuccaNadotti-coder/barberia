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

/** Variable obligatoria: si falta, se cae con un mensaje que dice cuál. */
export function requerida(nombre: string): string {
  const v = process.env[nombre]
  if (!v || v.length === 0) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Revisa .env.local (mira .env.example).`,
    )
  }
  return v
}

/** Variable opcional: devuelve undefined en lugar de reventar. */
export function opcional(nombre: string): string | undefined {
  const v = process.env[nombre]
  return v && v.length > 0 ? v : undefined
}

/** URL pública del sitio, sin barra final. Se usa en correos y en el .ics. */
export function urlSitio(): string {
  const v =
    opcional('NEXT_PUBLIC_URL_SITIO') ??
    (opcional('VERCEL_URL') ? `https://${opcional('VERCEL_URL')}` : undefined) ??
    'http://localhost:3000'
  return v.replace(/\/+$/, '')
}
