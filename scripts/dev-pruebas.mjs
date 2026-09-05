/**
 * `next dev` con Turnstile en modo de PRUEBA.
 *
 * Con el secreto real configurado, /api/reservar exige un token de widget que
 * sólo un navegador puede resolver, así que `npm run test:e2e` recibiría un 403
 * en la primera reserva y no llegaría a probar nada más.
 *
 * Cloudflare publica un par de claves de prueba para exactamente esto: el
 * secreto de abajo da por válido CUALQUIER token. No es un secreto real y no
 * sirve para nada en producción — es documentación pública de Cloudflare.
 *
 * Next no pisa las variables que ya vienen en process.env, así que este valor
 * gana sobre el de .env.local sin tocar el archivo.
 *
 * Para levantar el servidor de verdad (con tu secreto real), usa `npm run dev`.
 */
import { spawn } from 'node:child_process'

const SECRETO_DE_PRUEBA = '1x0000000000000000000000000000000AA' // "siempre pasa"

console.log('\x1b[33m⚠ Turnstile en modo de prueba: se acepta cualquier token.\x1b[0m')
console.log('\x1b[2m  Sólo para npm run test:e2e. Usa `npm run dev` para el comportamiento real.\x1b[0m\n')

const hijo = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, TURNSTILE_SECRET_KEY: SECRETO_DE_PRUEBA },
})

hijo.on('exit', (codigo) => process.exit(codigo ?? 0))
