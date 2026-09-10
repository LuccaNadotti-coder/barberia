/** Regresiones de galería y avisos. Renderiza componentes reales sin red ni datos personales. */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import assert from 'node:assert/strict'
import { FlujoReserva } from '../src/components/FlujoReserva'
import { AvisosWhatsApp } from '../src/components/AvisosWhatsApp'
import { mensajeRechazo } from '../src/lib/whatsapp'
import type { Reserva, EstadoCita } from '../src/lib/supabase'

// tsx conserva la transformación JSX clásica del proyecto fuera de Next.
Object.assign(globalThis, { React })
const reserva: Reserva = {
  id: '00000000-0000-4000-8000-000000000001', codigo: 'BR-ABCDE',
  inicio: '2030-01-15T15:00:00Z', fin: '2030-01-15T15:30:00Z',
  estado: 'pendiente_pago', expira_en: new Date(Date.now() + 900000).toISOString(),
  servicio_nombre: 'Corte prueba', duracion_min: 30, precio_centimos: 3000, adelanto_centimos: 1500,
  barbero_nombre: 'Barbero de prueba', yape_numero: '900000001', yape_titular: 'Titular diferente',
  cliente_nombre: 'Cliente prueba', cliente_telefono: '51900000002', cliente_email: null,
}
const html = renderToStaticMarkup(<FlujoReserva servicios={[]} barberos={[]}
  nombreLocal="Local prueba" reservaInicial={reserva} />)
const input = html.match(/<input[^>]+type="file"[^>]*>/)?.[0]
assert.ok(input, 'Existe selector de archivo para el comprobante')
assert.doesNotMatch(input, /\bcapture(?:=|\s|>)/, 'No fuerza cámara: permite elegir de la galería')
assert.match(input, /image\/png/, 'Admite capturas PNG guardadas')
assert.match(html, /Elegir captura de la galería/)
assert.match(html, /Barbero de prueba/)
assert.match(html, /900 000 001/)
assert.match(html, /Titular diferente/, 'No confunde nombre del barbero con titular de Yape')
assert.ok(!html.includes('Se acabaron los 15 minutos'), 'Recuperación no muestra vencimiento falso al montar')
console.log('PASA: galería habilitada, destinatario visible y vencimiento original')

function enlaces(estado: EstadoCita, inicio = reserva.inicio) {
  const panel = renderToStaticMarkup(<AvisosWhatsApp estado={estado}
    telefono={reserva.cliente_telefono} datos={{ ...reserva, inicio }} />)
  return [...panel.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1]!))
}
const revision = enlaces('en_revision')
assert.equal(revision.length, 1)
assert.match(revision[0]!.searchParams.get('text')!, /pendiente de aprobación/)
assert.doesNotMatch(revision[0]!.searchParams.get('text')!, /quedó confirmado/)
for (const inicio of ['2030-01-15T15:00:00Z', '2030-01-16T15:00:00Z', '2030-01-20T15:00:00Z']) {
  const confirmada = enlaces('confirmada', inicio)
  assert.equal(confirmada.length, 2, 'Confirmación y recordatorio para cualquier fecha')
  assert.match(confirmada[0]!.searchParams.get('text')!, /cita está aprobada/)
  assert.match(confirmada[1]!.searchParams.get('text')!, /10:00/)
  assert.doesNotMatch(confirmada[1]!.searchParams.get('text')!, /mañana/, 'No promete un día relativo equivocado')
  for (const url of confirmada) {
    assert.equal(url.origin, 'https://wa.me')
    assert.equal(url.pathname, '/51900000002', 'Destinatario: celular del cliente, no el del barbero')
    assert.match(url.searchParams.get('text')!, /BR-ABCDE/)
  }
}
for (const estado of ['cancelada', 'liberada', 'atendida', 'no_show'] as const) {
  assert.equal(enlaces(estado).length, 0, 'No ofrece confirmar una cita cerrada')
}
assert.match(mensajeRechazo(reserva), /comprobante se sube allí/)
assert.doesNotMatch(mensajeRechazo(reserva), /mándamela por aquí/)
console.log('PASA: avisos por estado, destinatario, fecha y subida siempre en web')
