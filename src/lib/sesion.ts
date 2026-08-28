import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requerida } from './entorno'
import type { Database } from './basedatos'
import type { BarberoSesion } from './supabase'

type CookieAEscribir = { name: string; value: string; options?: CookieOptions }

// SÓLO SERVIDOR. Este módulo importa next/headers; el cliente de navegador
// está en sesion-navegador.ts para que no acabe en el bundle del cliente.
export type { BarberoSesion }

/**
 * Sesión del barbero, SIEMPRE en cookies httpOnly — nunca en localStorage.
 *
 * El cliente por defecto de supabase-js guarda el JWT en localStorage, que es
 * legible por cualquier script de la página. @supabase/ssr lo guarda en
 * cookies, así que:
 *   · un XSS no puede leer el token,
 *   · el servidor conoce la sesión sin que el navegador se la pase a mano.
 */

const url = () => requerida('NEXT_PUBLIC_SUPABASE_URL')
const anon = () => requerida('NEXT_PUBLIC_SUPABASE_ANON_KEY')

/**
 * Para Server Components y Route Handlers.
 * Las peticiones que haga respetan el RLS: el barbero sólo ve lo suyo.
 */
// Sin anotación de retorno a propósito: @supabase/ssr trae su propia copia de
// los tipos de supabase-js y sus parámetros genéricos no coinciden exactamente
// con los del paquete principal. Dejando que TypeScript infiera, el tipo es el
// correcto y sigue estando completamente tipado contra Database.
export function clienteRuta() {
  const store = cookies()
  return createServerClient<Database>(url(), anon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista: CookieAEscribir[]) => {
        // En un Server Component no se pueden escribir cookies; el middleware
        // ya se encarga de refrescar la sesión, así que se ignora sin ruido.
        try {
          for (const { name, value, options } of lista) store.set(name, value, options)
        } catch {
          /* noop */
        }
      },
    },
  })
}

/**
 * Devuelve el barbero de la sesión, o null.
 *
 * Usa getUser() y no getSession(): getUser() valida el JWT contra el servidor
 * de Auth. getSession() se fía de la cookie, que el usuario controla.
 */
/** El cliente que devuelve clienteRuta(), tipado contra Database. */
export type ClienteRuta = ReturnType<typeof clienteRuta>

export async function barberoDeSesion(
  cliente?: ClienteRuta,
): Promise<BarberoSesion | null> {
  const sb = cliente ?? clienteRuta()

  const { data: auth, error } = await sb.auth.getUser()
  if (error || !auth?.user) return null

  const { data: barbero } = await sb
    .from('barberos')
    .select('id, nombre, es_admin, activo')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (!barbero || !barbero.activo) return null

  return {
    user_id: auth.user.id,
    barbero_id: barbero.id as string,
    nombre: barbero.nombre as string,
    es_admin: Boolean(barbero.es_admin),
  }
}
