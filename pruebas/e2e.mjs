/**
 * PRUEBAS DE EXTREMO A EXTREMO
 *
 *   1. npm run dev          (en otra terminal)
 *   2. npm run test:e2e
 *
 * Golpea la app real contra la base real y comprueba las reglas que no se
 * pueden verificar sólo con SQL: que el precio del body se ignore, que los
 * magic bytes frenen un archivo disfrazado, que el panel exija sesión, y —lo
 * más escurridizo— que la disponibilidad NO se sirva desde la caché de Next.
 *
 * Sólo necesita .env.local. Limpia todo lo que crea.
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const SB = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.URL_APP ?? 'http://localhost:3000'

if (!SB || !ANON || !SVC) {
  console.error('Faltan variables de Supabase en .env.local')
  process.exit(1)
}

const hAnon = { apikey: ANON, Authorization: `Bearer ${ANON}` }
const hSvc = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

let fallos = 0
const ok = (t, d = '') => console.log(`  \x1b[32mPASA\x1b[0m  ${t}${d ? '  \x1b[2m' + d + '\x1b[0m' : ''}`)
const no = (t, d = '') => {
  fallos++
  console.log(`  \x1b[31mFALLA\x1b[0m ${t}  ${d}`)
}
const hm = (s) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(s))

/** service_role ignora el RLS: sirve para preparar y limpiar. */
const borrar = (tabla, filtro) =>
  fetch(`${SB}/rest/v1/${tabla}?${filtro}`, { method: 'DELETE', headers: hSvc })
const contar = async (tabla) => {
  const r = await fetch(`${SB}/rest/v1/${tabla}?select=id`, {
    headers: { ...hSvc, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number((r.headers.get('content-range') ?? '/0').split('/')[1])
}

async function main() {
  const barberos = await (await fetch(`${SB}/rest/v1/barberos_publicos?select=id,nombre&order=orden`, { headers: hAnon })).json()
  const servicios = await (await fetch(`${SB}/rest/v1/servicios?select=id,nombre,precio_centimos,duracion_min&order=orden`, { headers: hAnon })).json()
  const barbero = barberos[0]
  const servicio = servicios.find((s) => s.duracion_min === 30) ?? servicios[0]
  const enLima = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)

  const horasDe = async (fecha) => {
    const q = new URLSearchParams({ barbero_id: barbero.id, servicio_id: servicio.id, fecha })
    const r = await fetch(`${APP}/api/disponibilidad?${q}`)
    return (await r.json()).horas ?? []
  }

  // Busca el primer día con hueco. Si sólo se mirara HOY, la suite no se
  // podría correr de noche ni en domingo por la tarde — y una prueba que sólo
  // funciona en horario comercial acaba sin correrse nunca.
  let fecha = null
  let horas = []
  for (let i = 0; i < 8 && !horas.length; i++) {
    fecha = enLima(new Date(Date.now() + i * 86400000))
    horas = await horasDe(fecha)
  }
  if (!horas.length) {
    console.log('\nNo hay ni un hueco en 8 días. ¿Están bien los horarios de la tabla `horarios`?')
    process.exit(1)
  }
  const disponibilidad = () => horasDe(fecha)

  const slot = horas.at(-1)
  console.log(`\nSlot elegido: ${fecha} ${hm(slot)} (Lima) con ${barbero.nombre}\n`)

  // ── 1 · Reservar ────────────────────────────────────────────────────────────
  let r = await fetch(`${APP}/api/reservar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      servicio_id: servicio.id, barbero_id: barbero.id, inicio: slot,
      nombre: 'Ana Prueba', telefono: '999 111 222', email: 'ana@example.com',
    }),
  })
  let j = await r.json()
  if (r.status !== 201 || !j.reserva) {
    no('POST /api/reservar', `${r.status} ${JSON.stringify(j).slice(0, 200)}`)
    process.exit(1)
  }
  const res = j.reserva
  ok('POST /api/reservar', `201 · ${res.codigo}`)

  res.precio_centimos === servicio.precio_centimos
    ? ok('precio congelado por la base', `S/ ${(res.precio_centimos / 100).toFixed(2)}`)
    : no('precio congelado', JSON.stringify(res))

  const mins = Math.round((new Date(res.expira_en) - Date.now()) / 60000)
  mins >= 14 && mins <= 15 ? ok('slot bloqueado 15 min', `expira en ~${mins} min`) : no('expira_en', `${mins} min`)

  // ── 2 · LA REGRESIÓN DE LA CACHÉ ────────────────────────────────────────────
  // Si Next cachea el fetch de supabase-js, aquí seguirían apareciendo horas
  // que ya están ocupadas y el cliente recibiría un 409 al elegirlas.
  const despues = await disponibilidad()
  const solapadas = despues.filter((h) => {
    const ini = new Date(h).getTime()
    const fin = ini + servicio.duracion_min * 60000
    const rIni = new Date(res.inicio).getTime()
    const rFin = new Date(res.fin).getTime()
    return ini < rFin && fin > rIni
  })
  solapadas.length === 0
    ? ok('la disponibilidad NO se sirve cacheada', `${horas.length} → ${despues.length} slots, 0 solapados`)
    : no('CACHÉ DE NEXT', `ofrece ${solapadas.length} hora(s) imposible(s): ${solapadas.map(hm).join(' ')}`)

  // ── 3 · Mismo slot otra vez → 409 ───────────────────────────────────────────
  r = await fetch(`${APP}/api/reservar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ servicio_id: servicio.id, barbero_id: barbero.id, inicio: slot, nombre: 'Otro', telefono: '988777666' }),
  })
  j = await r.json()
  r.status === 409 && j.conflicto ? ok('slot ya tomado → 409', j.error) : no('conflicto', `${r.status}`)

  // ── 4 · Precio y estado del body: ignorados ─────────────────────────────────
  const libres = await disponibilidad()
  if (libres.length) {
    r = await fetch(`${APP}/api/reservar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        servicio_id: servicio.id, barbero_id: barbero.id, inicio: libres.at(-1),
        nombre: 'Hacker Prueba', telefono: '988777666',
        precio_centimos: 1, adelanto_centimos: 1, estado: 'confirmada',
      }),
    })
    j = await r.json()
    if (r.status === 201) {
      j.reserva.precio_centimos === servicio.precio_centimos && j.reserva.estado === 'pendiente_pago'
        ? ok('precio y estado del body IGNORADOS', `S/ ${(j.reserva.precio_centimos / 100).toFixed(2)}, ${j.reserva.estado}`)
        : no('inyección desde el body', JSON.stringify(j.reserva))
      await borrar('citas', `codigo=eq.${j.reserva.codigo}`)
    } else no('inyección desde el body', `${r.status} ${JSON.stringify(j).slice(0, 150)}`)
  }

  // ── 5 · Archivo que no es imagen → 415 ──────────────────────────────────────
  const fd = new FormData()
  fd.set('cita_id', res.id)
  fd.set('codigo', res.codigo)
  fd.set('archivo', new Blob([Buffer.from('<?php system($_GET[0]); ?>')], { type: 'image/jpeg' }), 'malicioso.jpg')
  r = await fetch(`${APP}/api/captura`, { method: 'POST', body: fd })
  r.status === 415
    ? ok('PHP disfrazado de .jpg → 415', 'los magic bytes lo cazan')
    : no('magic bytes', `${r.status}`)

  // ── 6 · Panel sin sesión → 401 ──────────────────────────────────────────────
  r = await fetch(`${APP}/api/panel/validar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cita_id: res.id, accion: 'confirmar' }),
  })
  r.status === 401 ? ok('POST /api/panel/validar sin sesión → 401') : no('auth del panel', `${r.status}`)

  // ── 7 · Cancelar libera el slot ─────────────────────────────────────────────
  // Se hace por la base (service_role) porque cancelar desde la API exige
  // sesión de barbero; lo que se comprueba aquí es la consecuencia: que el
  // EXCLUDE deje de retener el horario y vuelva a ofrecerse.
  const antesDeCancelar = (await disponibilidad()).length
  await fetch(`${SB}/rest/v1/citas?codigo=eq.${res.codigo}`, {
    method: 'PATCH', headers: hSvc,
    body: JSON.stringify({ estado: 'cancelada', cancelada_en: new Date().toISOString() }),
  })
  const trasCancelar = await disponibilidad()
  trasCancelar.some((h) => h === res.inicio)
    ? ok('cancelar devuelve el slot al pool', `${antesDeCancelar} → ${trasCancelar.length} slots`)
    : no('cancelar', `el horario ${hm(res.inicio)} sigue sin ofrecerse`)

  // ── 8 · Las NEXT_PUBLIC_ llegan al bundle del navegador ─────────────────────
  //
  // Next sustituye `process.env.NEXT_PUBLIC_ALGO` por su valor SÓLO si la
  // propiedad se escribe literal. Con clave dinámica (`process.env[nombre]`)
  // no sustituye nada: en el navegador `process.env` llega vacío y el cliente
  // de Auth no se puede construir.
  //
  // Eso rompía el login del panel entero con un «No se pudo conectar» que
  // parecía de red. Ninguna prueba de servidor lo detecta: hay que mirar el
  // JavaScript que se descarga el navegador.
  {
    const html = await (await fetch(`${APP}/panel/login`)).text()
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map((m) => m[0]))]
    let inyectada = false
    for (const c of chunks) {
      const js = await (await fetch(`${APP}${c}`)).text()
      if (js.includes(new URL(SB).host)) { inyectada = true; break }
    }
    inyectada
      ? ok('las NEXT_PUBLIC_ llegan al bundle del navegador', `${chunks.length} chunks revisados`)
      : no('BUNDLE DEL CLIENTE', 'la URL de Supabase no está inyectada: el login del panel no funcionará')
  }

  // ── 9 · anon no lee datos personales ────────────────────────────────────────
  for (const tabla of ['citas', 'clientes', 'pagos']) {
    const rr = await fetch(`${SB}/rest/v1/${tabla}?select=*`, { headers: hAnon })
    rr.status === 401 || rr.status === 403
      ? ok(`anon no puede leer ${tabla}`, `${rr.status}`)
      : no(`anon leyó ${tabla}`, `${rr.status}`)
  }

  // ── Limpieza ────────────────────────────────────────────────────────────────
  await borrar('citas', `codigo=eq.${res.codigo}`)
  await borrar('clientes', 'telefono=in.(51999111222,51988777666)')
  const [c1, c2] = [await contar('citas'), await contar('clientes')]
  c1 === 0 && c2 === 0
    ? ok('base limpia tras las pruebas', '0 citas, 0 clientes')
    : console.log(`  \x1b[2mnota: quedan ${c1} citas y ${c2} clientes (¿datos reales?)\x1b[0m`)

  console.log(fallos === 0 ? '\n\x1b[32m\x1b[1mE2E: TODO PASA\x1b[0m\n' : `\n\x1b[31m\x1b[1m${fallos} FALLO(S)\x1b[0m\n`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nfallo inesperado:', e.message)
  console.error('¿está `npm run dev` corriendo?')
  process.exit(1)
})
