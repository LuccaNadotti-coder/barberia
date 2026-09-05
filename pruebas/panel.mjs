/**
 * PRUEBAS DEL PANEL — login real y aislamiento entre barberos.
 *
 *   npm run test:panel
 *
 * Lo importante que verifica: que «cada barbero ve sólo sus citas y el dueño
 * ve todas» lo imponga la BASE (RLS) y no el frontend. Por eso las consultas
 * van directas a PostgREST con el token de cada barbero, saltándose la app
 * entera: si el aislamiento dependiera del frontend, aquí se caería.
 *
 * Lee las credenciales de CREDENCIALES-PANEL.local.md (ignorado por git) y
 * nunca las imprime.
 */
import { existsSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }),
)
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const hSvc = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

let fallos = 0
const ok = (t, d = '') => console.log(`  \x1b[32mPASA\x1b[0m  ${t}${d ? '  \x1b[2m' + d + '\x1b[0m' : ''}`)
const no = (t, d = '') => { fallos++; console.log(`  \x1b[31mFALLA\x1b[0m ${t}  ${d}`) }

const ARCHIVO = 'CREDENCIALES-PANEL.local.md'
if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}. Pon las credenciales ahí o usa las tuyas.`)
  process.exit(1)
}

/** Extrae los pares correo/contraseña del documento de credenciales. */
function credenciales() {
  const t = readFileSync(ARCHIVO, 'utf8')
  const correos = [...t.matchAll(/correo:\s*(\S+)/g)].map((m) => m[1])
  const claves = [...t.matchAll(/contraseña:\s*(\S+)/g)].map((m) => m[1])
  const nombres = [...t.matchAll(/^##\s+(\w+)/gm)].map((m) => m[1])
  return nombres.map((nombre, i) => ({ nombre, email: correos[i], clave: claves[i] }))
}

async function entrar(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description ?? j.msg ?? JSON.stringify(j).slice(0, 150))
  return j.access_token
}

const comoBarbero = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}` })

async function main() {
  const cuentas = credenciales()
  if (cuentas.length < 2 || cuentas.some((c) => !c.email || !c.clave || c.clave.startsWith('('))) {
    console.log('  (credenciales incompletas o ya rotadas: sáltate esta prueba o actualiza el archivo)')
    process.exit(0)
  }

  const barberos = await (await fetch(`${SB}/rest/v1/barberos?select=id,nombre,es_admin`, { headers: hSvc })).json()
  const idDe = (n) => barberos.find((b) => b.nombre === n)?.id
  const servicio = (await (await fetch(`${SB}/rest/v1/servicios?select=id,nombre&limit=1`, { headers: hSvc })).json())[0]

  // ── Semilla: 2 citas para cada barbero, en días distintos para no chocar ────
  const base = new Date(Date.now() + 7 * 86400000)
  base.setUTCHours(15, 0, 0, 0)
  await fetch(`${SB}/rest/v1/clientes`, {
    method: 'POST', headers: { ...hSvc, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ nombre: 'Cliente Panel', telefono: '51900000077' }),
  })
  const cliente = (await (await fetch(`${SB}/rest/v1/clientes?telefono=eq.51900000077&select=id`, { headers: hSvc })).json())[0]

  const semilla = []
  let i = 0
  for (const nombre of cuentas.map((c) => c.nombre)) {
    for (let k = 0; k < 2; k++) {
      const ini = new Date(base.getTime() + i * 3600000)
      semilla.push({
        codigo: `BR-PNL${i}${k}`.slice(0, 8), cliente_id: cliente.id, barbero_id: idDe(nombre),
        servicio_id: servicio.id, servicio_nombre: servicio.nombre, duracion_min: 30,
        precio_centimos: 3000, adelanto_centimos: 1500,
        inicio: ini.toISOString(), fin: new Date(ini.getTime() + 30 * 60000).toISOString(),
        estado: 'confirmada',
      })
      i++
    }
  }
  await fetch(`${SB}/rest/v1/citas`, { method: 'POST', headers: hSvc, body: JSON.stringify(semilla) })

  const total = semilla.length
  console.log(`\nSembradas ${total} citas (${total / 2} por barbero)\n`)

  // ── Login y aislamiento ─────────────────────────────────────────────────────
  for (const c of cuentas) {
    let token
    try {
      token = await entrar(c.email, c.clave)
      ok(`login de ${c.nombre}`, 'sesión obtenida')
    } catch (e) {
      no(`login de ${c.nombre}`, e.message)
      continue
    }

    const barbero = barberos.find((b) => b.nombre === c.nombre)
    const vistas = await (await fetch(`${SB}/rest/v1/citas?select=id,codigo,barbero_id`, { headers: comoBarbero(token) })).json()

    // Sólo se miden las citas SEMBRADAS aquí (código BR-PNL*). La barbería en
    // marcha tiene citas reales, y contra el total de la tabla estas cuentas
    // fallarían sin que el RLS tuviera nada que ver.
    const delaPrueba = vistas.filter((x) => x.codigo?.startsWith('BR-PNL'))
    const propias = delaPrueba.filter((x) => x.barbero_id === barbero.id).length
    const ajenas = delaPrueba.length - propias
    // Esta sí es global: un barbero no debe ver NINGUNA cita de otro, ni de
    // prueba ni real.
    const ajenasReales = vistas.filter((x) => x.barbero_id !== barbero.id).length

    if (barbero.es_admin) {
      delaPrueba.length === total
        ? ok(`${c.nombre} es admin: ve TODAS`, `${delaPrueba.length} de ${total} sembradas`)
        : no(`${c.nombre} admin`, `ve ${delaPrueba.length} de ${total} sembradas`)
    } else {
      ajenasReales === 0 && propias === total / 2
        ? ok(`${c.nombre} ve SÓLO las suyas`, `${propias} propias, 0 ajenas (de ${total})`)
        : no(`${c.nombre} aislamiento`, `${propias} propias, ${ajenas} ajenas de prueba, ${ajenasReales} ajenas en total`)
    }

    // Ni siquiera puede modificar las de otro.
    const otro = barberos.find((b) => b.id !== barbero.id)
    if (otro && !barbero.es_admin) {
      const rr = await fetch(`${SB}/rest/v1/citas?barbero_id=eq.${otro.id}`, {
        method: 'PATCH',
        headers: { ...comoBarbero(token), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ notas: 'intento de escritura ajena' }),
      })
      const tocadas = await rr.json()
      Array.isArray(tocadas) && tocadas.length === 0
        ? ok(`${c.nombre} no puede editar citas ajenas`, '0 filas afectadas')
        : no(`${c.nombre} escritura ajena`, JSON.stringify(tocadas).slice(0, 120))
    }

    // La consulta EXACTA que hace src/app/panel/page.tsx. `citas` tiene dos
    // claves foráneas a `barberos` (barbero_id y confirmada_por): sin el
    // `!citas_barbero_id_fkey`, PostgREST responde "more than one
    // relationship was found" y el panel sale en blanco.
    const columnas =
      'id, codigo, estado, servicio_nombre, duracion_min, precio_centimos, adelanto_centimos,' +
      ' inicio, fin, captura_path, captura_subida_en, notas, creado_en,' +
      ' clientes(nombre, telefono, email), barberos!citas_barbero_id_fkey(nombre)'
    const rp2 = await fetch(`${SB}/rest/v1/citas?select=${encodeURIComponent(columnas)}&order=inicio`, {
      headers: comoBarbero(token),
    })
    const filas = await rp2.json()
    if (Array.isArray(filas)) {
      const conBarbero = filas.filter((f) => f.barberos?.nombre).length
      conBarbero === filas.length
        ? ok(`consulta del panel para ${c.nombre}`, `${filas.length} filas, join a barberos resuelto`)
        : no(`consulta del panel para ${c.nombre}`, `${conBarbero}/${filas.length} con barbero`)
    } else {
      no(`consulta del panel para ${c.nombre}`, JSON.stringify(filas).slice(0, 160))
    }

    // Y el ledger sigue siendo intocable.
    const rp = await fetch(`${SB}/rest/v1/pagos?id=not.is.null`, {
      method: 'PATCH',
      headers: { ...comoBarbero(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto_centimos: 1 }),
    })
    rp.status === 401 || rp.status === 403 || rp.status === 404
      ? ok(`${c.nombre} no puede editar el ledger`, `${rp.status}`)
      : no(`${c.nombre} ledger`, `${rp.status}`)
  }

  // ── Limpieza ────────────────────────────────────────────────────────────────
  await fetch(`${SB}/rest/v1/citas?codigo=like.BR-PNL*`, { method: 'DELETE', headers: hSvc })
  await fetch(`${SB}/rest/v1/clientes?telefono=eq.51900000077`, { method: 'DELETE', headers: hSvc })
  ok('semilla eliminada')

  console.log(fallos === 0 ? '\n\x1b[32m\x1b[1mPANEL: TODO PASA\x1b[0m\n' : `\n\x1b[31m\x1b[1m${fallos} FALLO(S)\x1b[0m\n`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('fallo inesperado:', e.message); process.exit(1) })
