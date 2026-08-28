import Link from 'next/link'
import { Rotulo } from '@/components/ui'

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'

export const metadata = { title: 'Página no encontrada' }

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[380px] flex-col justify-center px-4 py-12 text-center">
      <Rotulo>{NOMBRE}</Rotulo>

      {/* El 404 en monoespaciada, como los códigos de reserva: es el mismo
          sistema visual, no una pantalla de error genérica pegada aparte. */}
      <div className="tabular mt-6 font-mono text-[64px] font-semibold leading-none text-tinta-500">
        404
      </div>

      <h1 className="mt-4 font-display text-[28px] uppercase leading-none text-hueso">
        Aquí no hay nada
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-hueso-tenue">
        El enlace está roto o la página ya no existe. Si venías a reservar,
        se hace desde el inicio.
      </p>

      <Link
        href="/"
        className="pulsable mt-8 inline-flex min-h-[48px] items-center justify-center rounded-pastilla bg-laton px-5 text-[15px] font-semibold text-tinta-900 hover:bg-laton-claro"
      >
        Reservar mi turno
      </Link>
    </main>
  )
}
