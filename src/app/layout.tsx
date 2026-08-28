import type { Metadata, Viewport } from 'next'
import { Anton, IBM_Plex_Mono, Manrope } from 'next/font/google'
import './globals.css'

/**
 * Fuentes autoalojadas por next/font: no hay petición a fonts.googleapis.com
 * en tiempo de ejecución. En 4G eso es medio segundo menos y cero CLS.
 */
const display = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--fuente-display',
  display: 'swap',
})

const sans = Manrope({
  subsets: ['latin'],
  variable: '--fuente-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fuente-mono',
  display: 'swap',
})

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'

export const metadata: Metadata = {
  title: { default: `${NOMBRE} · Reserva tu turno`, template: `%s · ${NOMBRE}` },
  description:
    'Reserva tu corte en menos de un minuto. Eliges servicio, barbero y hora, ' +
    'pagas el adelanto por Yape y listo.',
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0D1420',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad para quien
  // necesita acercar el texto.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
