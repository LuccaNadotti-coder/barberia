import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './basedatos'

/**
 * Cliente de Auth para componentes 'use client'.
 *
 * Vive en su propio archivo, separado de sesion.ts, porque aquél importa
 * `next/headers` y eso no puede entrar en el bundle del navegador. Si los dos
 * comparten módulo, el build falla — y con razón.
 *
 * @supabase/ssr guarda la sesión en COOKIES, no en localStorage: es lo que
 * permite cumplir la regla de «sin localStorage en el frontend» y además deja
 * el token fuera del alcance de cualquier script inyectado.
 *
 * ⚠️ LAS VARIABLES SE LEEN CON LITERALES ESTÁTICOS, A PROPÓSITO.
 *
 * Next sustituye `process.env.NEXT_PUBLIC_ALGO` por su valor en tiempo de
 * compilación, pero SÓLO cuando la propiedad se escribe literal. Con una
 * clave dinámica —`process.env[nombre]`, como hace `requerida()` de
 * entorno.ts— no hay nada que sustituir: en el navegador `process.env` llega
 * vacío, el valor es undefined y el cliente no se puede construir.
 *
 * Eso rompía el login entero con un «No se pudo conectar» que parecía un
 * problema de red. Por eso `requerida()` es SÓLO PARA SERVIDOR y aquí se leen
 * a mano. No lo refactorices para «reutilizar» el helper.
 */
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const CLAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function clienteNavegador() {
  if (!URL_SUPABASE || !CLAVE_ANON) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el bundle. ' +
        'Revisa .env.local y reinicia `npm run dev` (las NEXT_PUBLIC_ se inyectan al compilar).',
    )
  }
  return createBrowserClient<Database>(URL_SUPABASE, CLAVE_ANON)
}
