import { NextResponse } from 'next/server'
import { clientePublico } from '@/lib/supabase'
import { erroresDeZod, esquemaDisponibilidad, traducirErrorRpc } from '@/lib/validacion'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
// `dynamic` por sí solo NO basta: hace dinámica la RUTA, pero Next sigue
// cacheando los fetch que hace supabase-js por dentro. Sin esto se sirven
// horas ya ocupadas.
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

/**
 * GET /api/disponibilidad?barbero_id=…&servicio_id=…&fecha=YYYY-MM-DD
 *
 * Devuelve SÓLO un arreglo de horas de inicio libres. Nada de citas, nada de
 * nombres, nada de por qué un hueco está ocupado: eso filtraría la agenda del
 * negocio a cualquiera que consulte el endpoint.
 *
 * Se llama con el rol anon a propósito. horarios_disponibles() es SECURITY
 * DEFINER, así que puede cruzar horarios × bloqueos × citas sin que el
 * anónimo tenga ni un GRANT sobre esas tablas.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams

  const parseo = esquemaDisponibilidad.safeParse({
    barbero_id: q.get('barbero_id') ?? '',
    servicio_id: q.get('servicio_id') ?? '',
    fecha: q.get('fecha') ?? '',
  })

  if (!parseo.success) {
    return NextResponse.json(
      { error: 'Parámetros inválidos', campos: erroresDeZod(parseo.error as z.ZodError) },
      { status: 400 },
    )
  }

  const { barbero_id, servicio_id, fecha } = parseo.data

  const { data, error } = await clientePublico({ sinCache: true }).rpc('horarios_disponibles', {
    p_barbero_id: barbero_id,
    p_servicio_id: servicio_id,
    p_fecha: fecha,
  })

  if (error) {
    const { mensaje, http } = traducirErrorRpc(error)
    return NextResponse.json({ error: mensaje }, { status: http })
  }

  // La RPC devuelve setof timestamptz → supabase-js lo entrega como string[].
  const horas = Array.isArray(data) ? (data as string[]) : []

  return NextResponse.json(
    { fecha, horas },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
