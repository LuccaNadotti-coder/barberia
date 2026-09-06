'use client'

import { useEffect, useRef } from 'react'

/**
 * Widget de Cloudflare Turnstile.
 *
 * El script se inyecta al montar, no en el `<head>` de toda la app: la mayoría
 * de visitas no llegan a un formulario, y son ~70 KB que no hacen falta para
 * mirar precios.
 *
 * Lo usan el paso 4 de la reserva y el formulario de /cita. Los dos tienen que
 * pasar por él, porque los dos escriben o leen en la base sin sesión.
 *
 * OJO con el dominio: si el hostname no está dado de alta en el widget, esto se
 * queda en «Verificando…» para siempre, no emite token y NADA se puede enviar.
 * En consola sale «Turnstile Error: 110200». Nos pasó en producción.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
    }
  }
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string
  onToken: (t: string | null) => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const pintado = useRef(false)

  useEffect(() => {
    if (pintado.current) return

    const pintar = () => {
      if (!caja.current || !window.turnstile || pintado.current) return
      pintado.current = true
      window.turnstile.render(caja.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      })
    }

    if (window.turnstile) {
      pintar()
      return
    }

    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = pintar
    document.head.appendChild(s)
  }, [siteKey, onToken])

  return <div ref={caja} className="min-h-[65px]" />
}
