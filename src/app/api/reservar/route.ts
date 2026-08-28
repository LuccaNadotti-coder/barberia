import { NextResponse } from 'next/server'
import { clientePublico, type Reserva } from '@/lib/supabase'
import {
  erroresDeZod,
  esquemaReserva,
  ipDe,
  traducirErrorRpc,
  verificarTurnstile,
} from '@/lib/validacion'
import type { z } from 'zod'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

/**
 * POST /api/reservar
 *
 * Crea la cita en 'pendiente_pago' y arranca la cuenta atrás de 15 minutos.
 *
 * REGLA QUE NO SE TOCA: del body sólo salen servicio_id, barbero_id, inicio y
 * los datos del cliente. El precio y el adelanto los CONGELA crear_reserva()
 * leyendo la tabla `servicios`. Si un día alguien acepta un `precio` de aquí,
 * cualquiera reserva un corte de S/ 90 pagando S/ 1 de adelanto.
 */
export async function POST(req: Request) {
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  const parseo = esquemaReserva.safeParse(cuerpo)
  if (!parseo.success) {
    return NextResponse.json(
      { error: 'Revisa los datos', campos: erroresDeZod(parseo.error as z.ZodError) },
      { status: 400 },
    )
  }
  const d = parseo.data

  // Anti-bots antes de tocar la base: si no, un script llena la agenda de
  // reservas basura que ocupan slots durante 15 minutos cada una.
  if (!(await verificarTurnstile(d.turnstile, ipDe(req)))) {
    return NextResponse.json(
      { error: 'No pudimos verificar que eres una persona. Recarga la página.' },
      { status: 403 },
    )
  }

  const { data, error } = await clientePublico({ sinCache: true }).rpc('crear_reserva', {
    p_servicio_id: d.servicio_id,
    p_barbero_id: d.barbero_id,
    p_inicio: d.inicio,
    p_nombre: d.nombre,
    p_telefono: d.telefono,
    // undefined y no null: la firma generada de la RPC declara estos dos
    // parámetros como opcionales, y PostgREST aplica el DEFAULT si se omiten.
    p_email: d.email ?? undefined,
    p_notas: d.notas ?? undefined,
  })

  if (error) {
    const { mensaje, http } = traducirErrorRpc(error)
    // 409 = otra persona se llevó el slot mientras este cliente rellenaba.
    return NextResponse.json({ error: mensaje, conflicto: http === 409 }, { status: http })
  }

  // La RPC devuelve jsonb; el tipo generado es Json. `Reserva` documenta su
  // forma real (ver crear_reserva() en sql/01-schema.sql).
  const reserva = data as unknown as Reserva

  return NextResponse.json(
    { reserva },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}
