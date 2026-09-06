/** @type {import('next').NextConfig} */

/**
 * POLÍTICA DE SEGURIDAD DE CONTENIDO
 *
 * Lo que de verdad para un XSS aquí es que no haya `localStorage` ni token de
 * sesión legible desde JS (la del barbero va en cookie httpOnly). La CSP es la
 * segunda barrera: si alguien logra inyectar HTML, no puede cargar un script de
 * su propio dominio ni mandar los datos a otro sitio.
 *
 * `'unsafe-inline'` en script-src es una concesión consciente: Next inyecta los
 * scripts de hidratación en línea, y quitarla exige nonces por petición, o sea
 * middleware en cada request. Aun con ella, esta CSP bloquea lo que más duele:
 * cargar código de un host ajeno y filtrar datos con un `fetch` a otro dominio.
 *
 * Cada host de aquí está porque algo se rompe sin él:
 *   · challenges.cloudflare.com → Turnstile (script y el iframe del widget)
 *   · *.supabase.co             → las llamadas del navegador a la base
 *   · blob:                     → el worker de browser-image-compression, que
 *                                 comprime la captura del Yape antes de subirla
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${
    process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  }`,
  "frame-src https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Un año. Sin `preload`: eso es irreversible durante meses y hay que
          // decidirlo con el dominio propio delante, no con un *.vercel.app.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
      {
        // El panel y la recuperación de una reserva enseñan datos personales.
        // Que no queden en la caché de un móvil prestado ni en un proxy.
        source: '/(panel|cita)/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ]
  },
}

export default nextConfig
