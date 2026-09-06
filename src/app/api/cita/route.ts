import { NextResponse } from 'next/server'
import { clientePublico, type Reserva } from '@/lib/supabase'
import {
  erroresDeZod,
  esquemaBuscarCita,
  ipDe,
  traducirErrorRpc,
  verificarTurnstile,
} from '@/lib/validacion'
import type { z } from 'zod'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

/**
 * POST /api/cita   { codigo, telefono, turnstile }
 *
 * Devuelve una reserva ya creada para que el cliente pueda retomar el pago.
 *
 * Existe porque el flujo no guarda nada en el teléfono (ver CLAUDE.md §5): si
 * la persona recarga o cierra la pestaña después de reservar, sin esto pierde
 * el ticket y no puede subir la captura del Yape — habiendo pagado ya.
 *
 * Dos capas contra la enumeración de códigos:
 *   1. Turnstile, igual que en /api/reservar. Sin él un script prueba millones.
 *   2. Hacen falta código Y celular, y buscar_reserva() responde lo mismo si
 *      falla cualquiera de los dos: no sirve como oráculo.
 *
 * Y una tercera en la base: el rol anon no tiene ni un GRANT sobre `citas`, así
 * que sólo puede ver lo que esta RPC decida devolverle.
 */
export async function POST(req: Request) {
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  const parseo = esquemaBuscarCita.safeParse(cuerpo)
  if (!parseo.success) {
    return NextResponse.json(
      { error: 'Revisa los datos', campos: erroresDeZod(parseo.error as z.ZodError) },
      { status: 400 },
    )
  }
  const d = parseo.data

  // Antes de tocar la base: si no, esto es una máquina de probar códigos.
  if (!(await verificarTurnstile(d.turnstile, ipDe(req)))) {
    return NextResponse.json(
      { error: 'No pudimos verificar que eres una persona. Recarga la página.' },
      { status: 403 },
    )
  }

  const { data, error } = await clientePublico({ sinCache: true }).rpc('buscar_reserva', {
    p_codigo: d.codigo,
    p_telefono: d.telefono,
  })

  if (error) {
    const { mensaje, http } = traducirErrorRpc(error)
    // 404 y no 400: para quien pregunta, el resultado es "no existe".
    return NextResponse.json({ error: mensaje }, { status: http === 400 ? 404 : http })
  }

  const reserva = data as unknown as Reserva

  return NextResponse.json(
    { reserva },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
