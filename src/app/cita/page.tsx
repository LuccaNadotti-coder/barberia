import { RecuperarReserva } from '@/components/RecuperarReserva'
import { Aviso, Rotulo } from '@/components/ui'
import {
  clientePublico,
  supabaseConfigurado,
  type BarberoPublico,
  type Servicio,
} from '@/lib/supabase'
import { claveSitioTurnstile } from '@/lib/validacion'

export const metadata = {
  title: 'Retoma tu reserva',
  description: 'Recupera tu ticket con el código y tu celular para subir la captura del Yape.',
}

// Igual que la portada: el catálogo se cachea, la reserva concreta se busca en
// vivo contra /api/cita.
export const revalidate = 300

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'
const DIRECCION = process.env.NEXT_PUBLIC_DIRECCION_LOCAL || undefined
const QR = process.env.NEXT_PUBLIC_YAPE_QR_URL || undefined

export default async function Cita() {
  if (!supabaseConfigurado()) {
    return (
      <main className="mx-auto max-w-[440px] px-4 py-16">
        <Rotulo>Configuración pendiente</Rotulo>
        <div className="mt-6">
          <Aviso tono="alerta">Falta conectar Supabase.</Aviso>
        </div>
      </main>
    )
  }

  const sb = clientePublico()

  // Se cargan para que, si la persona decide reservar otra cita desde aquí, el
  // flujo tenga catálogo sin otra vuelta al servidor.
  const [{ data: servicios }, { data: barberos }] = await Promise.all([
    sb
      .from('servicios')
      .select('id, nombre, descripcion, duracion_min, precio_centimos, adelanto_pct, orden')
      .order('orden'),
    sb.from('barberos_publicos').select('id, nombre, avatar_url, orden').order('orden'),
  ])

  return (
    <main>
      <header className="border-b border-tinta-600 px-4 py-5">
        <div className="mx-auto flex max-w-[440px] items-center justify-between">
          <div>
            <Rotulo>{NOMBRE}</Rotulo>
            <p className="mt-1 text-[13px] text-hueso-tenue">Retoma tu reserva</p>
          </div>
          <a
            href="/"
            className="pulsable rounded-pastilla border border-tinta-600 px-3 py-2 text-[12px] text-hueso-apagado hover:text-hueso-tenue"
          >
            Inicio
          </a>
        </div>
      </header>

      <RecuperarReserva
        servicios={(servicios ?? []) as Servicio[]}
        barberos={(barberos ?? []) as BarberoPublico[]}
        nombreLocal={NOMBRE}
        direccion={DIRECCION}
        yapeQrUrl={QR}
        turnstileSiteKey={claveSitioTurnstile()}
      />
    </main>
  )
}
