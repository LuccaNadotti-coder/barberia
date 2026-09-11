'use client'

import { useState } from 'react'
import type { BarberoPublico, Reserva, Servicio } from '@/lib/supabase'
import { FlujoReserva } from './FlujoReserva'
import { Turnstile } from './Turnstile'
import { Aviso, Boton, Campo, Rotulo } from './ui'

/**
 * RETOMAR UNA RESERVA — código del ticket + celular.
 *
 * Por qué existe: el flujo de reserva no guarda nada en el teléfono (nada de
 * localStorage: es un móvil que se presta y son datos personales). El precio de
 * esa decisión es que si la persona recarga o cierra la pestaña justo después
 * de reservar, pierde el ticket — y con él la única forma de subir la captura
 * del Yape. Ya pagó y no puede demostrarlo. Esta pantalla cierra ese agujero.
 *
 * Hacen falta los dos datos, y el servidor responde lo mismo si falla
 * cualquiera de ellos: así esto no sirve para averiguar qué códigos existen.
 */

interface Props {
  servicios: Servicio[]
  barberos: BarberoPublico[]
  nombreLocal: string
  direccion?: string
  yapeQrUrl?: string
  turnstileSiteKey?: string
}

export function RecuperarReserva(props: Props) {
  const [codigo, setCodigo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [reserva, setReserva] = useState<Reserva | null>(null)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    setErrores({})
    setError(null)
    setBuscando(true)

    try {
      const r = await fetch('/api/cita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, telefono, turnstile: token ?? undefined }),
      })
      const j = (await r.json()) as {
        reserva?: Reserva
        error?: string
        campos?: Record<string, string>
      }

      if (!r.ok) {
        if (j.campos) setErrores(j.campos)
        setError(j.error ?? 'No pudimos recuperar la reserva')
        return
      }

      setReserva(j.reserva!)
    } catch {
      setError('Sin conexión. Revisa tus datos móviles e inténtalo de nuevo.')
    } finally {
      setBuscando(false)
    }
  }

  // Encontrada: el flujo de siempre se encarga del resto (cronómetro, subida
  // de la captura y ticket). No se duplica ni una línea de esa pantalla.
  if (reserva) return <FlujoReserva {...props} reservaInicial={reserva} />

  return (
    <div className="px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <form onSubmit={buscar} className="mx-auto max-w-[440px] sm:max-w-[480px]">
        <Rotulo>Tu reserva</Rotulo>
        <h1 className="mt-2 font-display text-3xl uppercase leading-none text-hueso sm:text-[38px]">
          Retoma tu pago
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-hueso-tenue">
          ¿Cerraste la página antes de subir la captura? Escribe el código de tu ticket y el
          celular con el que reservaste.
        </p>

        {error && (
          <div className="mt-5">
            <Aviso tono="error">{error}</Aviso>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <Campo
            id="codigo"
            etiqueta="Código del ticket"
            name="codigo"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="BR-A1B2C"
            required
            className="tabular font-mono uppercase tracking-[0.12em]"
            value={codigo}
            error={errores.codigo}
            // El alfabeto del código no tiene O ni 0 ni I ni 1, así que subir a
            // mayúsculas al vuelo no puede romper nada y evita un error tonto.
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          />
          <Campo
            id="telefono"
            etiqueta="Celular"
            name="telefono"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            enterKeyHint="done"
            placeholder="987 654 321"
            required
            value={telefono}
            error={errores.telefono}
            ayuda="El mismo con el que reservaste."
            onChange={(e) => setTelefono(e.target.value)}
          />
        </div>

        {props.turnstileSiteKey && (
          <div className="mt-5">
            <Turnstile siteKey={props.turnstileSiteKey} onToken={setToken} />
          </div>
        )}

        <div className="mt-6">
          <Boton type="submit" className="w-full" cargando={buscando}>
            Buscar mi reserva
          </Boton>
        </div>

        <p className="mt-6 text-center text-[13px] text-hueso-apagado">
          ¿No tienes código?{' '}
          <a href="/" className="text-laton underline underline-offset-4">
            Reserva desde cero
          </a>
        </p>
      </form>
    </div>
  )
}
