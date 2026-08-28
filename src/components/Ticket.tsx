import { fechaLarga, hora12, soles } from '@/lib/fechas'
import type { Reserva } from '@/lib/supabase'
import { cx } from './ui'

/**
 * EL TICKET — el elemento firma de toda la interfaz.
 *
 * Es lo único claro sobre un fondo entintado, y es lo que el cliente va a
 * capturar con el móvil y mandar por WhatsApp. Por eso:
 *   · el CÓDIGO manda: monoespaciado, enorme, con tracking abierto,
 *   · las muescas laterales están recortadas de verdad (máscara CSS), así que
 *     se ven bien sobre cualquier fondo en una captura de pantalla,
 *   · nada de degradados ni sombras internas: tiene que leerse a 200 px de
 *     ancho en la miniatura de un chat.
 */

interface Props {
  reserva: Reserva
  estado: 'en_revision' | 'confirmada'
  nombreLocal: string
  direccion?: string
}

export function Ticket({ reserva, estado, nombreLocal, direccion }: Props) {
  const saldo = reserva.precio_centimos - reserva.adelanto_centimos

  return (
    <div className="mx-auto w-full max-w-[360px] animate-emerger">
      {/* --corte fija la altura a la que se recortan las muescas laterales.
          Debe coincidir con la posición de la línea perforada de abajo. */}
      <div className="ticket rounded-ficha" style={{ ['--corte' as string]: '164px' }}>
        {/* ── Cabecera ─────────────────────────────────────────────────── */}
        <div className="px-6 pb-4 pt-6 text-center">
          <div className="font-display text-rotulo uppercase text-papel-tinta/45">
            {nombreLocal}
          </div>

          <div className="mt-5 text-[10px] uppercase tracking-[0.22em] text-papel-tinta/45">
            Tu turno
          </div>

          {/* El código. Es el héroe de la pantalla. */}
          <div className="tabular mt-1 select-all font-mono text-turno font-semibold text-papel-tinta">
            {reserva.codigo}
          </div>

          <EstadoSello estado={estado} />
        </div>

        {/* ── Línea de corte, a la altura de --corte ────────────────────── */}
        <div className="perforado mx-4" />

        {/* ── Cuerpo ───────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 px-6 pb-5 pt-5 text-[13.5px]">
          <Linea k="Servicio" v={reserva.servicio_nombre} />
          <Linea k="Barbero" v={reserva.barbero_nombre} />
          <Linea k="Día" v={capitalizar(fechaLarga(reserva.inicio))} />
          <Linea k="Hora" v={hora12(reserva.inicio)} mono />
          <Linea k="Duración" v={`${reserva.duracion_min} min`} mono />
        </dl>

        <div className="perforado mx-4" />

        {/* ── Cuentas ──────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-6 pb-6 pt-4 text-[13.5px]">
          <Linea k="Precio" v={soles(reserva.precio_centimos)} mono />
          <Linea k="Adelanto pagado" v={soles(reserva.adelanto_centimos)} mono />
          <div className="col-span-2 mt-1 flex items-baseline justify-between border-t border-dashed border-papel-sombra pt-2.5">
            <span className="font-semibold text-papel-tinta">Saldo en el local</span>
            <span className="tabular font-mono text-[17px] font-semibold text-papel-tinta">
              {soles(saldo)}
            </span>
          </div>
        </dl>

        {direccion && (
          <div className="border-t border-dashed border-papel-sombra px-6 py-3 text-center text-[11.5px] leading-snug text-papel-tinta/55">
            {direccion}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-hueso-apagado">
        Haz una captura de este ticket. Al llegar sólo di tu código.
      </p>
    </div>
  )
}

function EstadoSello({ estado }: { estado: 'en_revision' | 'confirmada' }) {
  const enRevision = estado === 'en_revision'
  return (
    <div
      className={cx(
        'mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
        'text-[11px] font-semibold uppercase tracking-[0.1em]',
        enRevision
          ? 'border-alerta/40 bg-alerta/10 text-[#8A6100]'
          : 'border-exito/40 bg-exito/10 text-[#25683F]',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          enRevision ? 'animate-latir bg-alerta' : 'bg-exito',
        )}
      />
      {enRevision ? 'En revisión' : 'Confirmada'}
    </div>
  )
}

function Linea({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-papel-tinta/50">{k}</dt>
      <dd
        className={cx(
          'text-right font-semibold text-papel-tinta',
          mono && 'tabular font-mono',
        )}
      >
        {v}
      </dd>
    </>
  )
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
