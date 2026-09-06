/**
 * PRUEBAS DE LAS LIBRERÍAS PURAS — sin red, sin base de datos.
 *
 *   npm run test:lib
 *
 * Cubre lo que no se ve hasta que un cliente abre el .ics en su móvil o el
 * barbero toca el enlace de WhatsApp: escapado RFC 5545, plegado de líneas a
 * 75 OCTETOS (no caracteres: "ñ" ocupa dos), normalización de teléfonos y
 * detección de imágenes por magic bytes.
 */
import { generarICS, nombreICS } from '../src/lib/ics'
import { cuentaAtras, soles } from '../src/lib/fechas'
import { esImagenReal, normalizarTelefono, telefonoLegible } from '../src/lib/validacion'
import { enlacePara, mensajeRecordatorio } from '../src/lib/whatsapp'
import { _sinComillas, opcional, requerida } from '../src/lib/entorno'
import { partirRemitente, remitenteValido } from '../src/lib/email'

let fallos = 0
const ok = (t: string, d = '') =>
  console.log(`  \x1b[32mPASA\x1b[0m  ${t}${d ? '  \x1b[2m' + d + '\x1b[0m' : ''}`)
const no = (t: string, d = '') => {
  fallos++
  console.log(`  \x1b[31mFALLA\x1b[0m ${t}  ${d}`)
}
const eq = (a: unknown, b: unknown, t: string) =>
  a === b ? ok(t, String(a)) : no(t, `esperaba ${JSON.stringify(b)}, obtuvo ${JSON.stringify(a)}`)

function main() {
  console.log('\n\x1b[1mTELÉFONOS\x1b[0m')
  eq(normalizarTelefono('987654321'), '51987654321', 'nueve dígitos')
  eq(normalizarTelefono('987 654 321'), '51987654321', 'con espacios')
  eq(normalizarTelefono('+51 987-654-321'), '51987654321', 'con prefijo y guiones')
  eq(normalizarTelefono('051987654321'), '51987654321', 'con 051')
  eq(normalizarTelefono('51987654321'), '51987654321', 'ya en E.164')
  eq(normalizarTelefono('887654321'), null, 'no empieza por 9 → rechazado')
  eq(normalizarTelefono('98765432'), null, 'ocho dígitos → rechazado')
  eq(normalizarTelefono(''), null, 'vacío → rechazado')
  eq(telefonoLegible('51987654321'), '987 654 321', 'formato legible')

  console.log('\n\x1b[1mMAGIC BYTES\x1b[0m')
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
  eq(esImagenReal(jpeg), 'image/jpeg', 'JPEG')
  eq(esImagenReal(png), 'image/png', 'PNG')
  eq(esImagenReal(webp), 'image/webp', 'WEBP')
  eq(esImagenReal(new TextEncoder().encode('<?php system($_GET[0]); ?>')), null, 'PHP → rechazado')
  eq(esImagenReal(new TextEncoder().encode('<svg onload=alert(1)>xxxx')), null, 'SVG con script → rechazado')
  eq(esImagenReal(new Uint8Array([0xff, 0xd8])), null, 'truncado → rechazado')

  console.log('\n\x1b[1mDINERO Y CRONÓMETRO\x1b[0m')
  eq(soles(3000), 'S/ 30.00', 'céntimos → soles')
  eq(soles(2250), 'S/ 22.50', 'con decimales')
  eq(soles(0), 'S/ 0.00', 'cero')
  eq(cuentaAtras(900000), '15:00', '15 minutos')
  eq(cuentaAtras(65000), '01:05', 'un minuto y cinco')
  eq(cuentaAtras(-5000), '00:00', 'negativo se acota a cero')

  console.log('\n\x1b[1mARCHIVO .ICS\x1b[0m')
  const ics = generarICS({
    uid: 'abc-123',
    codigo: 'BR-A1B2',
    inicio: '2026-08-31T21:00:00.000Z',
    fin: '2026-08-31T21:30:00.000Z',
    // Coma y punto y coma: RFC 5545 exige escaparlos o el archivo se rompe.
    servicio: 'Corte clásico, con lavado; y peinado',
    barbero: 'Marco Ñuñez',
    local: 'Barbería El Turno',
    direccion: 'Av. Larco 1234, Miraflores',
    sello: new Date('2026-08-27T12:00:00Z'),
  })

  const lineas = ics.split('\r\n')
  ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR')
    ? ok('estructura VCALENDAR')
    : no('estructura')
  ics.includes('DTSTART:20260831T210000Z') ? ok('DTSTART en UTC compacto') : no('DTSTART')
  ics.includes('TRIGGER:-PT2H') ? ok('alarma 2 h antes') : no('alarma')
  ics.replace(/\r\n /g, '').includes('\\, con lavado\\; y peinado')
    ? ok('coma y punto y coma escapados')
    : no('escapado RFC 5545')
  ics.endsWith('\r\n') ? ok('terminado en CRLF') : no('CRLF final')

  // Ninguna línea puede pasar de 75 OCTETOS (las continuaciones van con espacio).
  const largas = lineas.filter((l) => Buffer.byteLength(l, 'utf8') > 75)
  largas.length === 0
    ? ok('ninguna línea supera 75 octetos', `${lineas.length} líneas`)
    : no('plegado RFC 5545', `${largas.length} línea(s) demasiado largas`)

  // Al desplegarlas se recupera el texto original, con la eñe intacta.
  ics.replace(/\r\n /g, '').includes('Marco Ñuñez')
    ? ok('la eñe sobrevive al plegado')
    : no('plegado multibyte')
  eq(nombreICS('BR-A1B2'), 'cita-BR-A1B2.ics', 'nombre del adjunto')

  console.log('\n\x1b[1mWHATSAPP (sólo enlaces, sin API)\x1b[0m')
  const datos = {
    cliente_nombre: 'Ana Torres',
    servicio_nombre: 'Corte clásico',
    barbero_nombre: 'Marco',
    inicio: '2026-08-31T21:00:00.000Z',
    codigo: 'BR-A1B2',
    precio_centimos: 3000,
    adelanto_centimos: 1500,
  }
  const enlace = enlacePara('recordatorio', '51987654321', datos)
  enlace.startsWith('https://wa.me/51987654321?text=')
    ? ok('enlace wa.me bien formado')
    : no('enlace', enlace.slice(0, 60))
  !/api\.|token|Bearer/i.test(enlace)
    ? ok('no hay ninguna llamada a la API de WhatsApp')
    : no('¡hay API!')
  const texto = decodeURIComponent(enlace.split('text=')[1] ?? '')
  texto.includes('BR-A1B2') && texto.includes('Ana')
    ? ok('el mensaje lleva código y nombre')
    : no('mensaje')
  mensajeRecordatorio(datos).includes('S/ 15.00')
    ? ok('el recordatorio indica el saldo')
    : no('saldo en el mensaje')

  // ── El fallo que dejó producción sin un solo correo ───────────────────────
  //
  // En un `.env`, dotenv quita las comillas de CLAVE="valor". El panel de
  // Vercel no: el valor es lo que pegas. Copiar la línea del .env.local al
  // dashboard metía las comillas dentro del valor, y Resend rechazaba TODOS
  // los envíos con «Invalid `from` field». En local funcionaba.
  console.log('\n\x1b[1mENTORNO Y REMITENTE\x1b[0m')
  eq(_sinComillas('"Barbería <hola@x.com>"'), 'Barbería <hola@x.com>', 'quita comillas dobles')
  eq(_sinComillas("'hola@x.com'"), 'hola@x.com', 'quita comillas simples')
  eq(_sinComillas('hola@x.com'), 'hola@x.com', 'deja el valor limpio intacto')
  eq(_sinComillas('  hola@x.com  '), 'hola@x.com', 'recorta espacios')
  eq(_sinComillas('di "hola"'), 'di "hola"', 'no toca comillas interiores')

  process.env.__PRUEBA_ENV = '"Barbería <hola@x.com>"'
  eq(requerida('__PRUEBA_ENV'), 'Barbería <hola@x.com>', 'requerida() las quita')
  eq(opcional('__PRUEBA_ENV'), 'Barbería <hola@x.com>', 'opcional() las quita')
  process.env.__PRUEBA_ENV = '""'
  eq(opcional('__PRUEBA_ENV'), undefined, 'unas comillas vacías cuentan como vacío')
  delete process.env.__PRUEBA_ENV

  remitenteValido('hola@x.com') ? ok('remitente: correo suelto') : no('remitente suelto')
  remitenteValido('Barbería <hola@x.com>')
    ? ok('remitente: con nombre')
    : no('remitente con nombre')
  !remitenteValido('"Barbería <hola@x.com>"')
    ? ok('remitente: rechaza el valor entrecomillado', 'el fallo real de producción')
    : no('REMITENTE ENTRECOMILLADO ACEPTADO', 'volvería a fallar en producción')
  !remitenteValido('Barbería') ? ok('remitente: rechaza texto suelto') : no('texto suelto')

  // Brevo quiere el nombre y el correo por separado, no la cadena entera.
  eq(partirRemitente('hola@x.com').correo, 'hola@x.com', 'partir: correo suelto')
  eq(partirRemitente('hola@x.com').nombre, undefined, 'partir: sin nombre')
  eq(partirRemitente('Barbería <hola@x.com>').correo, 'hola@x.com', 'partir: correo con nombre')
  eq(partirRemitente('Barbería <hola@x.com>').nombre, 'Barbería', 'partir: nombre')
  eq(partirRemitente('"El Templo" <hola@x.com>').nombre, 'El Templo', 'partir: nombre entrecomillado')

  console.log(
    fallos === 0
      ? '\n\x1b[32m\x1b[1mLIBRERÍAS: TODO PASA\x1b[0m\n'
      : `\n\x1b[31m\x1b[1m${fallos} FALLO(S)\x1b[0m\n`,
  )
  process.exit(fallos === 0 ? 0 : 1)
}

main()
