import { NextResponse } from 'next/server'
import {
  clientePublico,
  clienteServidor,
  fila,
  primero,
  type BarberoAnidado,
  type CitaParaCorreo,
  type ClienteAnidado,
} from '@/lib/supabase'
import { enviarPreReserva, type DatosCorreo } from '@/lib/email'
import { generarClaveCaptura, r2Configurado, subirObjeto } from '@/lib/r2'
import {
  MAX_CAPTURA_BYTES,
  erroresDeZod,
  esImagenReal,
  esquemaCaptura,
  traducirErrorRpc,
} from '@/lib/validacion'
import type { z } from 'zod'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs' // node:crypto para firmar SigV4
export const maxDuration = 30

/**
 * POST /api/captura   (multipart/form-data: cita_id, codigo, archivo)
 *
 * El cliente sube aquí la captura del Yape. Nunca por WhatsApp: así queda
 * atada a la reserva, con sello de tiempo, en un bucket privado.
 *
 * Orden deliberado:
 *   1. validar identidad de la reserva (id + código)
 *   2. validar el archivo por MAGIC BYTES, no por extensión ni Content-Type
 *   3. subir a R2 con nombre generado por el servidor
 *   4. registrar_captura() → pendiente_pago pasa a en_revision
 *   5. correo de pre-reserva
 *
 * El paso 4 va DESPUÉS de la subida: si R2 falla, la cita sigue en
 * pendiente_pago y el cliente puede reintentar dentro de su plazo. Al revés
 * quedaría "en revisión" sin imagen que revisar.
 *
 * Y lo que NO hace: confirmar. Una imagen es falsificable; la validación real
 * es el tap del barbero en el panel.
 */
export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Se esperaba multipart/form-data' }, { status: 400 })
  }

  const parseo = esquemaCaptura.safeParse({
    cita_id: form.get('cita_id') ?? '',
    codigo: form.get('codigo') ?? '',
  })
  if (!parseo.success) {
    return NextResponse.json(
      { error: 'Reserva inválida', campos: erroresDeZod(parseo.error as z.ZodError) },
      { status: 400 },
    )
  }
  const { cita_id, codigo } = parseo.data

  // ── El archivo ──────────────────────────────────────────────────────────────
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta la captura' }, { status: 400 })
  }
  if (archivo.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
  }
  if (archivo.size > MAX_CAPTURA_BYTES) {
    return NextResponse.json(
      { error: `La imagen pesa demasiado (máximo ${MAX_CAPTURA_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    )
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())

  // Magic bytes. Ni `archivo.type` ni la extensión: ambos los pone el cliente.
  const tipo = esImagenReal(bytes)
  if (!tipo) {
    return NextResponse.json(
      { error: 'El archivo no es una imagen válida. Sube una captura JPG, PNG o WEBP.' },
      { status: 415 },
    )
  }

  if (!r2Configurado()) {
    console.error('[captura] R2 sin configurar')
    return NextResponse.json(
      { error: 'El almacenamiento no está configurado. Avisa a la barbería.' },
      { status: 503 },
    )
  }

  // ── Subida (nombre siempre del servidor) ────────────────────────────────────
  const clave = generarClaveCaptura(tipo, codigo)
  try {
    await subirObjeto(clave, bytes, tipo)
  } catch (e) {
    console.error('[captura] fallo al subir a R2', e)
    return NextResponse.json(
      { error: 'No pudimos guardar tu captura. Inténtalo otra vez.' },
      { status: 502 },
    )
  }

  // ── Transición de estado ────────────────────────────────────────────────────
  const { data, error } = await clientePublico({ sinCache: true }).rpc('registrar_captura', {
    p_cita_id: cita_id,
    p_codigo: codigo,
    p_path: clave,
  })

  if (error) {
    const { mensaje, http } = traducirErrorRpc(error)
    return NextResponse.json({ error: mensaje }, { status: http })
  }

  // ── Correo de pre-reserva (no bloquea la respuesta si falla) ────────────────
  await notificarPreReserva(cita_id)

  return NextResponse.json(
    { cita: data, estado: 'en_revision' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * Lee la cita con service_role (el anónimo no tiene GRANT sobre `citas`) sólo
 * para armar el correo, y deja registro en `notificaciones`.
 */
async function notificarPreReserva(cita_id: string): Promise<void> {
  try {
    const sb = clienteServidor()
    const { data } = await sb
      .from('citas')
      // La FK va explícita: `citas` apunta dos veces a `barberos`
      // (barbero_id y confirmada_por) y PostgREST no puede adivinar cuál.
      .select(
        'id, codigo, estado, servicio_nombre, inicio, fin, precio_centimos, adelanto_centimos,' +
          ' clientes(nombre, email), barberos!citas_barbero_id_fkey(nombre)',
      )
      .eq('id', cita_id)
      .maybeSingle()

    const cita = fila<CitaParaCorreo>(data)
    if (!cita) return

    const cliente = primero<ClienteAnidado>(cita.clientes)
    const barbero = primero<BarberoAnidado>(cita.barberos)
    if (!cliente?.email) return

    const datos: DatosCorreo = {
      id: cita.id,
      codigo: cita.codigo,
      cliente_nombre: cliente.nombre ?? '',
      cliente_email: cliente.email,
      servicio_nombre: cita.servicio_nombre,
      barbero_nombre: barbero?.nombre ?? '',
      inicio: cita.inicio,
      fin: cita.fin,
      precio_centimos: cita.precio_centimos,
      adelanto_centimos: cita.adelanto_centimos,
    }

    const r = await enviarPreReserva(datos)

    await sb.from('notificaciones').insert({
      cita_id,
      canal: 'email',
      tipo: 'pre_reserva',
      destino: cliente.email,
      estado: r.ok ? 'enviado' : 'fallido',
      proveedor_id: r.id ?? null,
      error: r.error ?? null,
    })
  } catch (e) {
    // Que no se envíe el correo no invalida la reserva: la captura ya está
    // guardada y el barbero la verá igual en el panel.
    console.error('[captura] no se pudo notificar la pre-reserva', e)
  }
}
