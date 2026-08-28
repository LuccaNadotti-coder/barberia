import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { opcional, requerida } from './entorno'
import type { Database } from './basedatos'

/**
 * `basedatos.ts` está GENERADO. No lo edites a mano. Si cambias el esquema:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > src/lib/basedatos.ts
 *
 * Gracias a él, `sb.from('citas').select(...)` devuelve filas tipadas de
 * verdad y un typo en un nombre de columna es un error de compilación, no un
 * `undefined` en producción.
 */
export type ClienteBarberia = SupabaseClient<Database>

/**
 * Dos clientes, y sólo dos. La diferencia importa:
 *
 *   clientePublico()  → anon key. Puede viajar al navegador. Sujeto a RLS.
 *   clienteServidor() → service_role. IGNORA RLS por completo.
 *                       Si esta clave llega al navegador, cualquiera puede
 *                       leer y escribir toda la base. Por eso el módulo se
 *                       niega a construirlo si detecta que corre en cliente.
 */

/**
 * Next parchea el `fetch` global y CACHEA las peticiones que hace supabase-js.
 * Para el catálogo eso es bueno (cambia una vez al mes). Para la
 * disponibilidad es un error grave: se le ofrecerían al cliente horas que ya
 * están ocupadas, y al intentar reservarlas recibiría un 409.
 *
 * Se detectó en pruebas reales: tras ocupar las 19:30, la RPC devolvía 17
 * slots correctos pero la ruta seguía respondiendo los 20 de antes, en 6 ms
 * en lugar de 1500 — la firma inconfundible de una respuesta cacheada.
 */
const fetchSinCache: typeof fetch = (entrada, init) =>
  fetch(entrada, { ...init, cache: 'no-store' })

/**
 * Cliente anónimo. Sólo puede: leer el catálogo y llamar a las 3 RPC públicas.
 *
 * `sinCache: true` es OBLIGATORIO en todo lo que dependa del estado de la
 * agenda (disponibilidad, reservar, captura). Omítelo sólo para datos que
 * pueden ir con unos minutos de retraso, como el catálogo de servicios.
 */
export function clientePublico(opciones?: { sinCache?: boolean }): ClienteBarberia {
  return createClient<Database>(
    requerida('NEXT_PUBLIC_SUPABASE_URL'),
    requerida('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(opciones?.sinCache ? { global: { fetch: fetchSinCache } } : {}),
    },
  )
}

/**
 * Cliente con service_role. EXCLUSIVO del servidor.
 *
 * La guarda es doble a propósito:
 *  1. `typeof window` → si alguien lo importa en un componente 'use client'.
 *  2. el nombre de la variable no lleva NEXT_PUBLIC_, así que Next ni siquiera
 *     la inyecta en el bundle del navegador (llegaría undefined y `requerida`
 *     lanzaría). La comprobación explícita da un mensaje entendible.
 */
export function clienteServidor(): ClienteBarberia {
  if (typeof window !== 'undefined') {
    throw new Error(
      'clienteServidor() se ha importado en el navegador. La SUPABASE_SERVICE_ROLE_KEY ' +
        'jamás debe salir del servidor: usa clientePublico() o una API route.',
    )
  }
  return createClient<Database>(
    requerida('NEXT_PUBLIC_SUPABASE_URL'),
    requerida('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Siempre sin caché: con service_role sólo se leen y escriben datos
      // vivos (citas, pagos, notificaciones). Aquí no hay nada cacheable.
      global: { headers: { 'X-Cliente': 'barberia-servidor' }, fetch: fetchSinCache },
    },
  )
}

/**
 * Cliente que actúa EN NOMBRE de un barbero, usando su access token.
 * Respeta el RLS: el barbero sólo ve lo suyo (y el admin, todo). Se usa en el
 * panel para que las reglas de acceso vivan en la base, no en el frontend.
 */
export function clienteConSesion(accessToken: string): ClienteBarberia {
  return createClient<Database>(
    requerida('NEXT_PUBLIC_SUPABASE_URL'),
    requerida('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  )
}

/** ¿Están configuradas las claves? Sirve para dar un aviso claro en dev. */
export function supabaseConfigurado(): boolean {
  return Boolean(
    opcional('NEXT_PUBLIC_SUPABASE_URL') && opcional('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  )
}

// ── Tipos del dominio (espejo de sql/01-schema.sql) ───────────────────────────

/** Barbero identificado por la sesión. Vive aquí para que lo puedan importar
 *  tanto el servidor como los componentes de cliente sin arrastrar
 *  `next/headers` al bundle del navegador. */
export interface BarberoSesion {
  user_id: string
  barbero_id: string
  nombre: string
  es_admin: boolean
}

export type EstadoCita =
  | 'pendiente_pago'
  | 'en_revision'
  | 'confirmada'
  | 'atendida'
  | 'no_show'
  | 'liberada'
  | 'cancelada'

export type TipoPago = 'adelanto' | 'saldo' | 'reembolso'
export type MetodoPago = 'yape' | 'plin' | 'efectivo' | 'transferencia' | 'otro'

export interface Servicio {
  id: string
  nombre: string
  descripcion: string | null
  duracion_min: number
  precio_centimos: number
  adelanto_pct: number
  orden: number
}

export interface BarberoPublico {
  id: string
  nombre: string
  avatar_url: string | null
  orden: number
}

/** Lo que devuelve la RPC crear_reserva(). */
export interface Reserva {
  id: string
  codigo: string
  inicio: string
  fin: string
  estado: EstadoCita
  expira_en: string
  servicio_nombre: string
  duracion_min: number
  precio_centimos: number
  adelanto_centimos: number
  barbero_nombre: string
  yape_numero: string | null
  yape_titular: string | null
  cliente_nombre: string
  cliente_telefono: string
  cliente_email: string | null
}

/** Fila de `citas` tal como la ve el panel. */
export interface Cita {
  id: string
  codigo: string
  cliente_id: string
  barbero_id: string
  servicio_id: string
  servicio_nombre: string
  duracion_min: number
  precio_centimos: number
  adelanto_centimos: number
  inicio: string
  fin: string
  estado: EstadoCita
  expira_en: string | null
  captura_path: string | null
  captura_subida_en: string | null
  confirmada_en: string | null
  motivo_rechazo: string | null
  recordatorio_email_en: string | null
  notas: string | null
  creado_en: string
}

export interface ClienteAnidado {
  id?: string
  nombre?: string
  telefono?: string
  email?: string | null
}

export interface BarberoAnidado {
  id?: string
  nombre?: string
}

export interface CitaConCliente extends Cita {
  clientes: ClienteAnidado | ClienteAnidado[] | null
  barberos: BarberoAnidado | BarberoAnidado[] | null
}

/** Lo que seleccionan las rutas para armar un correo o pintar el panel. */
export interface CitaParaCorreo {
  id: string
  codigo: string
  estado: EstadoCita
  servicio_nombre: string
  inicio: string
  fin: string
  precio_centimos: number
  adelanto_centimos: number
  barbero_id?: string
  clientes: ClienteAnidado | ClienteAnidado[] | null
  barberos: BarberoAnidado | BarberoAnidado[] | null
}

/**
 * Sin tipos generados por `supabase gen types`, supabase-js devuelve un union
 * con GenericStringError y TypeScript no deja leer ningún campo. Esto acota el
 * resultado a la forma que sabemos que tiene el SELECT.
 *
 * Cuando quieras tipos de verdad:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/basedatos.ts
 */
export function fila<T>(data: unknown): T | null {
  return (data ?? null) as T | null
}

/** supabase-js entrega las relaciones como objeto o como array según el caso. */
export function primero<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}
