'use client'

import { useEffect } from 'react'
import { Boton, Rotulo } from '@/components/ui'

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'

/**
 * Frontera de error de la app.
 *
 * Lo que NO hace: enseñar el mensaje de la excepción. Un stack trace puede
 * filtrar nombres de tabla, rutas del servidor o fragmentos de consulta.
 * El cliente ve un mensaje llano y un botón; el detalle va a la consola del
 * servidor, que es donde sirve de algo.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] error no controlado', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[380px] flex-col justify-center px-4 py-12 text-center sm:max-w-[440px] sm:px-6">
      <Rotulo>{NOMBRE}</Rotulo>

      <h1 className="mt-6 font-display text-[28px] uppercase leading-none text-hueso">
        Algo se rompió
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-hueso-tenue">
        No es culpa tuya. Vuelve a intentarlo; si sigue igual, escríbenos por
        WhatsApp y te reservamos el turno a mano.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        <Boton onClick={reset}>Reintentar</Boton>
        <a
          href="/"
          className="pulsable inline-flex min-h-[48px] items-center justify-center rounded-pastilla border border-tinta-600 text-[14px] text-hueso-tenue"
        >
          Volver al inicio
        </a>
      </div>

      {/* El digest identifica el error en los logs del servidor sin revelar
          nada de su contenido. Sirve para que puedas decirnos cuál fue. */}
      {error.digest && (
        <p className="tabular mt-6 font-mono text-[11px] text-hueso-apagado">
          ref {error.digest}
        </p>
      )}
    </main>
  )
}
