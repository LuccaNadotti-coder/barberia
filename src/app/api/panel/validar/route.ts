import { NextResponse } from 'next/server'
import { barberoDeSesion, clienteRuta } from '@/lib/sesion'
import { enviarConfirmacion, enviarRechazo, type DatosCorreo } from '@/lib/email'
import { erroresDeZod, esquemaValidar, type EntradaValidar } from '@/lib/validacion'
import type { Database } from '@/lib/basedatos'
import {
  fila,
  primero,
  type BarberoAnidado,
  type CitaParaCorreo,
  type ClienteAnidado,
  type EstadoCita,
} from '@/lib/supabase'
import type { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/panel/validar   { cita_id, accion, motivo?, referencia? }
 *
 * El tap del barbero. Cuatro acciones:
 *
 *   confirmar → en_revision  → confirmada.  Inserta el ADELANTO en el ledger
 *                              y manda el correo con el .ics.
 *   rechazar  → en_revision  → pendiente_pago, con 30 min extra de plazo.
 *   atendida  → confirmada   → atendida.    Inserta el SALDO en el ledger.
 *   no_show   → confirmada   → no_show.     NO se inserta nada: el adelanto ya
 *                              está cobrado y se queda como ingreso.
 *   cancelar  → pendiente_pago | en_revision | confirmada → cancelada.
 *                              LIBERA EL SLOT. Tampoco toca el ledger: si hay
 *                              que devolver el adelanto, se hace insertando
 *                              una fila de tipo 'reembolso' — el ledger es
 *                              append-only y esa devolución es una decisión
 *                              humana, no un efecto secundario de cancelar.
 *
 * Todo se hace con el cliente ATADO A LA SESIÓN, no con service_role. Así el
 * RLS aplica: si un barbero manda el id de una cita de su compañero, el UPDATE
 * afecta 0 filas y devolvemos 404. La regla vive en la base, no aquí.
 */
export async function POST(req: Request) {
  const sb = clienteRuta()
  const barbero = await barberoDeSesion(sb)
  if (!barbero) {
    return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  const parseo = esquemaValidar.safeParse(cuerpo)
  if (!parseo.success) {
    return NextResponse.json(
      { error: 'Petición inválida', campos: erroresDeZod(parseo.error as z.ZodError) },
      { status: 400 },
    )
  }
  const { cita_id, accion, motivo, referencia } = parseo.data

  // Estado actual. Si el RLS no deja verla, `data` viene vacío → 404.
  const { data } = await sb
    .from('citas')
    // FK explícita: hay dos relaciones citas→barberos (barbero_id y
    // confirmada_por) y sin desambiguar PostgREST rechaza la consulta.
    .select(
      'id, codigo, estado, servicio_nombre, inicio, fin, precio_centimos,' +
        ' adelanto_centimos, barbero_id, clientes(nombre, email),' +
        ' barberos!citas_barbero_id_fkey(nombre)',
    )
    .eq('id', cita_id)
    .maybeSingle()

  const cita = fila<CitaParaCorreo>(data)
  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }

  const estado = cita.estado
  const permitido = TRANSICIONES[accion]
  if (!permitido.includes(estado)) {
    return NextResponse.json(
      {
        error: `No se puede "${ETIQUETA[accion]}" una cita en estado ${estado}.`,
        estado,
      },
      { status: 409 },
    )
  }

  const ahora = new Date().toISOString()

  // ── Cambio de estado ────────────────────────────────────────────────────────
  // Tipado contra el esquema real: un typo en un nombre de columna es ahora un
  // error de compilación, no un UPDATE silencioso que no hace nada.
  const cambios: Database['public']['Tables']['citas']['Update'] =
    accion === 'confirmar'
      ? { estado: 'confirmada', confirmada_en: ahora, confirmada_por: barbero.barbero_id, motivo_rechazo: null }
      : accion === 'rechazar'
        ? {
            estado: 'pendiente_pago',
            // 30 minutos extra para subir otra captura.
            expira_en: new Date(Date.now() + 30 * 60_000).toISOString(),
            captura_path: null,
            captura_subida_en: null,
            motivo_rechazo: motivo ?? null,
          }
        : accion === 'atendida'
          ? { estado: 'atendida', cerrada_en: ahora }
          : accion === 'cancelar'
            ? {
                estado: 'cancelada',
                cancelada_en: ahora,
                expira_en: null,
                motivo_rechazo: motivo ?? null,
              }
            : { estado: 'no_show', cerrada_en: ahora }

  const { data: actualizada, error: errUpdate } = await sb
    .from('citas')
    .update(cambios)
    .eq('id', cita_id)
    .eq('estado', estado) // guarda contra dos taps simultáneos
    .select('id, estado')
    .maybeSingle()

  if (errUpdate) {
    console.error('[validar] fallo al actualizar', errUpdate)
    return NextResponse.json({ error: 'No se pudo actualizar la cita' }, { status: 500 })
  }
  if (!actualizada) {
    return NextResponse.json(
      { error: 'La cita cambió de estado mientras tanto. Recarga el panel.' },
      { status: 409 },
    )
  }

  // ── Ledger ──────────────────────────────────────────────────────────────────
  // Sólo INSERT, nunca UPDATE. El ledger es append-only por diseño.
  if (accion === 'confirmar') {
    const { error } = await sb.from('pagos').insert({
      cita_id,
      tipo: 'adelanto',
      monto_centimos: cita.adelanto_centimos,
      metodo: 'yape',
      referencia: referencia ?? null,
      registrado_por: barbero.barbero_id,
    })
    if (error) console.error('[validar] no se pudo registrar el adelanto', error)
  }

  if (accion === 'atendida') {
    const saldo = cita.precio_centimos - cita.adelanto_centimos
    if (saldo > 0) {
      const { error } = await sb.from('pagos').insert({
        cita_id,
        tipo: 'saldo',
        monto_centimos: saldo,
        metodo: 'efectivo',
        registrado_por: barbero.barbero_id,
      })
      if (error) console.error('[validar] no se pudo registrar el saldo', error)
    }
  }
  // no_show: no se inserta nada. El adelanto cobrado se queda como ingreso.

  // ── Correo ──────────────────────────────────────────────────────────────────
  const cliente = primero<ClienteAnidado>(cita.clientes)
  const barberoCita = primero<BarberoAnidado>(cita.barberos)

  if ((accion === 'confirmar' || accion === 'rechazar') && cliente?.email) {
    const datos: DatosCorreo = {
      id: cita.id,
      codigo: cita.codigo,
      cliente_nombre: cliente.nombre ?? '',
      cliente_email: cliente.email,
      servicio_nombre: cita.servicio_nombre,
      barbero_nombre: barberoCita?.nombre ?? barbero.nombre,
      inicio: cita.inicio,
      fin: cita.fin,
      precio_centimos: cita.precio_centimos,
      adelanto_centimos: cita.adelanto_centimos,
      motivo,
    }

    const r = accion === 'confirmar' ? await enviarConfirmacion(datos) : await enviarRechazo(datos)

    await sb.from('notificaciones').insert({
      cita_id,
      canal: 'email',
      tipo: accion === 'confirmar' ? 'confirmacion' : 'rechazo',
      destino: cliente.email,
      estado: r.ok ? 'enviado' : 'fallido',
      proveedor_id: r.id ?? null,
      error: r.error ?? null,
    })
  }

  return NextResponse.json(
    { ok: true, estado: actualizada.estado },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// ── Máquina de estados ────────────────────────────────────────────────────────
// Declarada, no repartida en ifs. Si mañana se añade un estado, se toca aquí.

type Accion = EntradaValidar['accion']

const TRANSICIONES: Record<Accion, EstadoCita[]> = {
  confirmar: ['en_revision'],
  rechazar: ['en_revision'],
  atendida: ['confirmada'],
  no_show: ['confirmada'],
  // Una cita ya cerrada (atendida / no_show) no se cancela: eso reescribiría
  // la historia. Y una ya liberada o cancelada no tiene slot que devolver.
  cancelar: ['pendiente_pago', 'en_revision', 'confirmada'],
}

const ETIQUETA: Record<Accion, string> = {
  confirmar: 'confirmar',
  rechazar: 'rechazar',
  atendida: 'marcar como atendida',
  no_show: 'marcar como no vino',
  cancelar: 'cancelar',
}
