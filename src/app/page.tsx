import { FlujoReserva } from '@/components/FlujoReserva'
import { Aviso, Rotulo } from '@/components/ui'
import {
  clientePublico,
  supabaseConfigurado,
  type BarberoPublico,
  type Servicio,
} from '@/lib/supabase'
import { claveSitioTurnstile } from '@/lib/validacion'

// El catálogo cambia poco, pero la disponibilidad se pide aparte y en vivo.
export const revalidate = 300

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'
const DIRECCION = process.env.NEXT_PUBLIC_DIRECCION_LOCAL || undefined
const QR = process.env.NEXT_PUBLIC_YAPE_QR_URL || undefined

export default async function Inicio() {
  if (!supabaseConfigurado()) return <SinConfigurar />

  const sb = clientePublico()

  // Sólo el catálogo y la VISTA pública de barberos. El rol anon no tiene
  // ni un GRANT sobre citas ni clientes: no hay nada que filtrar aquí.
  const [{ data: servicios }, { data: barberos }] = await Promise.all([
    sb
      .from('servicios')
      .select('id, nombre, descripcion, duracion_min, precio_centimos, adelanto_pct, orden')
      .order('orden'),
    sb.from('barberos_publicos').select('id, nombre, avatar_url, orden').order('orden'),
  ])

  return (
    <main>
      <Cabecera />
      <FlujoReserva
        servicios={(servicios ?? []) as Servicio[]}
        barberos={(barberos ?? []) as BarberoPublico[]}
        nombreLocal={NOMBRE}
        direccion={DIRECCION}
        yapeQrUrl={QR}
        turnstileSiteKey={claveSitioTurnstile()}
      />
      <Pie />
    </main>
  )
}

/**
 * El enlace a /cita no es decorativo: el flujo no guarda nada en el teléfono,
 * así que quien recarga la página a mitad del pago necesita esta puerta para
 * volver a su ticket. Si desaparece de aquí, se queda sin salida.
 */
function Pie() {
  return (
    <footer className="border-t border-tinta-600 px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-[440px] flex-col items-center gap-3 text-center sm:max-w-[680px]">
        <p className="text-[13px] text-hueso-tenue">
          ¿Ya reservaste y perdiste el ticket?{' '}
          <a href="/cita" className="text-laton underline underline-offset-4">
            Retoma tu pago
          </a>
        </p>
        <p className="text-[12px] text-hueso-apagado">
          {DIRECCION && <span className="block">{DIRECCION}</span>}
          <a href="/privacidad" className="underline underline-offset-4 hover:text-hueso-tenue">
            Privacidad
          </a>
        </p>
      </div>
    </footer>
  )
}

function Cabecera() {
  return (
    <header className="border-b border-tinta-600 px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-[440px] items-center justify-between sm:max-w-[680px]">
        <div>
          <Rotulo>{NOMBRE}</Rotulo>
          <p className="mt-1 text-[13px] text-hueso-tenue">Reserva tu turno</p>
        </div>
        <a
          href="/panel"
          className="pulsable rounded-pastilla border border-tinta-600 px-3 py-2 text-[12px] text-hueso-apagado hover:text-hueso-tenue"
        >
          Soy barbero
        </a>
      </div>
    </header>
  )
}

function SinConfigurar() {
  return (
    <main className="mx-auto max-w-[440px] px-4 py-16 sm:max-w-[560px] sm:px-6">
      <Rotulo>Configuración pendiente</Rotulo>
      <h1 className="mt-2 font-display text-3xl uppercase leading-none">Falta conectar Supabase</h1>
      <div className="mt-6">
        <Aviso tono="alerta">
          Copia <code className="font-mono text-hueso">.env.example</code> a{' '}
          <code className="font-mono text-hueso">.env.local</code> y rellena al menos{' '}
          <code className="font-mono text-hueso">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
          <code className="font-mono text-hueso">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Luego corre{' '}
          <code className="font-mono text-hueso">sql/01-schema.sql</code> en el editor SQL de tu
          proyecto.
        </Aviso>
      </div>
    </main>
  )
}
