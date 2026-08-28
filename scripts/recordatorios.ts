/**
 * CRON · todos los días a las 9:00 hora de Lima
 *
 * Manda por CORREO el recordatorio de las citas confirmadas de mañana.
 *
 * NO manda WhatsApp. Es deliberado: los mensajes de WhatsApp salen del móvil
 * del barbero, uno a uno, desde la pestaña «Mañana» del panel. Ver CLAUDE.md.
 *
 * `recordatorio_email_en` es el seguro contra duplicados: si el workflow se
 * reintenta o alguien lo lanza a mano, no le llegan dos correos al cliente.
 */

import './entorno-local' // no-op en CI; en local carga .env.local
import { createClient } from '@supabase/supabase-js'
import { enviarRecordatorio, type DatosCorreo } from '../src/lib/email'
import { limitesDelDia, mananaISO } from '../src/lib/fechas'

function requerida(n: string): string {
  const v = process.env[n]
  if (!v) {
    console.error(`Falta la variable de entorno ${n}`)
    process.exit(1)
  }
  return v
}

interface FilaCita {
  id: string
  codigo: string
  servicio_nombre: string
  inicio: string
  fin: string
  precio_centimos: number
  adelanto_centimos: number
  clientes: { nombre: string; email: string | null } | { nombre: string; email: string | null }[] | null
  barberos: { nombre: string } | { nombre: string }[] | null
}

const primero = <T,>(v: T | T[] | null): T | null =>
  v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v

async function main() {
  const sb = createClient(
    requerida('NEXT_PUBLIC_SUPABASE_URL'),
    requerida('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const manana = mananaISO()
  const { desde, hasta } = limitesDelDia(manana)
  console.log(`[recordatorios] citas de ${manana} (${desde} → ${hasta})`)

  const { data, error } = await sb
    .from('citas')
    // `barberos!citas_barbero_id_fkey`: `citas` tiene DOS claves foráneas a
    // `barberos` (barbero_id y confirmada_por). Sin decirle cuál, PostgREST
    // responde "more than one relationship was found" y la consulta falla.
    .select(
      'id, codigo, servicio_nombre, inicio, fin, precio_centimos, adelanto_centimos,' +
        ' clientes(nombre, email), barberos!citas_barbero_id_fkey(nombre)',
    )
    .eq('estado', 'confirmada')
    .is('recordatorio_email_en', null) // el seguro anti-duplicados
    .gte('inicio', desde)
    .lt('inicio', hasta)
    .order('inicio')

  if (error) {
    console.error('[recordatorios] no se pudieron leer las citas:', error.message)
    process.exit(1)
  }

  const citas = (data ?? []) as unknown as FilaCita[]
  if (citas.length === 0) {
    console.log('[recordatorios] no hay citas confirmadas para mañana')
    return
  }

  let enviados = 0
  let sinCorreo = 0
  let fallidos = 0

  for (const c of citas) {
    const cliente = primero(c.clientes)
    const barbero = primero(c.barberos)

    if (!cliente?.email) {
      // Sin correo no hay recordatorio automático. Al barbero le queda el
      // botón de WhatsApp en el panel, que para eso está.
      sinCorreo++
      continue
    }

    const datos: DatosCorreo = {
      id: c.id,
      codigo: c.codigo,
      cliente_nombre: cliente.nombre,
      cliente_email: cliente.email,
      servicio_nombre: c.servicio_nombre,
      barbero_nombre: barbero?.nombre ?? '',
      inicio: c.inicio,
      fin: c.fin,
      precio_centimos: c.precio_centimos,
      adelanto_centimos: c.adelanto_centimos,
    }

    const r = await enviarRecordatorio(datos)

    await sb.from('notificaciones').insert({
      cita_id: c.id,
      canal: 'email',
      tipo: 'recordatorio',
      destino: cliente.email,
      estado: r.ok ? 'enviado' : 'fallido',
      proveedor_id: r.id ?? null,
      error: r.error ?? null,
    })

    if (r.ok) {
      // Se marca SÓLO si se envió: si falló, mañana se reintenta.
      await sb
        .from('citas')
        .update({ recordatorio_email_en: new Date().toISOString() })
        .eq('id', c.id)
      enviados++
      console.log(`  ✓ ${c.codigo} → ${cliente.email}`)
    } else {
      fallidos++
      console.warn(`  ✗ ${c.codigo} → ${cliente.email}: ${r.error}`)
    }

    // Resend en capa gratuita limita a ~2 req/s. 600 ms va sobrado.
    await new Promise((r) => setTimeout(r, 600))
  }

  console.log(
    `[recordatorios] ${citas.length} cita(s): ${enviados} enviados, ` +
      `${sinCorreo} sin correo, ${fallidos} fallidos`,
  )

  // Que falle un correo no debe tumbar el workflow: quedó registrado en
  // `notificaciones` y se reintenta en la siguiente ejecución.
}

main().catch((e) => {
  console.error('[recordatorios] fallo inesperado:', e)
  process.exit(1)
})
