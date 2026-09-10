'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { fechaISO, fechaLarga, hora, hora12, mananaISO, soles } from '@/lib/fechas'
import { clienteNavegador } from '@/lib/sesion-navegador'
import type { BarberoSesion, EstadoCita } from '@/lib/supabase'
import { telefonoLegible } from '@/lib/validacion'
import { enlacePara } from '@/lib/whatsapp'
import { AvisosWhatsApp } from './AvisosWhatsApp'
import { Aviso, Boton, Rotulo, cx } from './ui'

export interface CitaPanel {
  id: string
  codigo: string
  estado: EstadoCita
  servicio_nombre: string
  duracion_min: number
  precio_centimos: number
  adelanto_centimos: number
  inicio: string
  fin: string
  notas: string | null
  captura_subida_en: string | null
  captura_url: string | null
  cliente_nombre: string
  cliente_telefono: string
  cliente_email: string | null
  barbero_nombre: string
}

type Pestana = 'validar' | 'hoy' | 'manana' | 'proximas'
type Accion = 'confirmar' | 'rechazar' | 'atendida' | 'no_show' | 'cancelar'

interface Props {
  barbero: BarberoSesion
  nombreLocal: string
  porValidar: CitaPanel[]
  hoy: CitaPanel[]
  manana: CitaPanel[]
  /** Confirmadas de pasado mañana en adelante. Sin ellas se perdían de vista. */
  proximas: CitaPanel[]
}

export function PanelBarbero({
  barbero,
  nombreLocal,
  porValidar,
  hoy,
  manana,
  proximas,
}: Props) {
  const router = useRouter()
  const [pestana, setPestana] = useState<Pestana>(porValidar.length > 0 ? 'validar' : 'hoy')
  const [error, setError] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ cita: CitaPanel; motivo?: string } | null>(null)
  const [, transicion] = useTransition()

  async function actuar(cita_id: string, accion: Accion, motivo?: string) {
    setError(null)
    setOcupada(cita_id)
    setAviso(null)
    try {
      const r = await fetch('/api/panel/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cita_id, accion, motivo }),
      })
      const j = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(j.error ?? 'No se pudo completar la acción')

      const modificada = [...porValidar, ...hoy, ...manana, ...proximas].find((c) => c.id === cita_id)
      if (modificada && (accion === 'confirmar' || accion === 'rechazar')) {
        setAviso({
          cita: { ...modificada, estado: accion === 'confirmar' ? 'confirmada' : 'pendiente_pago' },
          motivo,
        })
      }

      // Al confirmar, la cita se va de «Validar» a la pestaña que le toca por
      // fecha. Sin esto desaparece de la vista y hay que ir a buscarla para
      // avisar al cliente — que es justo lo siguiente que quieres hacer.
      if (accion === 'confirmar') {
        const cita = porValidar.find((c) => c.id === cita_id)
        if (cita) {
          const dia = fechaISO(cita.inicio)
          setPestana(dia === fechaISO(new Date()) ? 'hoy' : dia === mananaISO() ? 'manana' : 'proximas')
        }
      }

      transicion(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupada(null)
    }
  }

  async function salir() {
    await clienteNavegador().auth.signOut()
    router.replace('/panel/login')
    router.refresh()
  }

  const listas: Record<Pestana, CitaPanel[]> = { validar: porValidar, hoy, manana, proximas }
  const lista = listas[pestana]

  return (
    <main className="min-h-dvh pb-16">
      <header className="border-b border-tinta-600 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3 lg:max-w-[1120px]">
          <div className="min-w-0">
            <Rotulo>{nombreLocal}</Rotulo>
            <p className="mt-1 truncate text-[13px] text-hueso-tenue">
              {barbero.nombre}
              {barbero.es_admin && (
                <span className="ml-2 rounded border border-laton-hondo px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-laton">
                  dueño
                </span>
              )}
            </p>
          </div>
          <button
            onClick={salir}
            className="pulsable shrink-0 rounded-pastilla border border-tinta-600 px-3 py-2 text-[12px] text-hueso-apagado hover:text-hueso-tenue"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[560px] px-4 sm:px-6 lg:max-w-[1120px]">
        {/* ── Pestañas ─────────────────────────────────────────────────── */}
        {/* Cuatro pestañas en 328 px de un móvil de 360: la etiqueta se acorta a
            «Validar» y el texto baja a 12.5 px para que ninguna parta en dos
            líneas. La altura se fija a 48 px, el mínimo tocable del proyecto. */}
        <nav className="mt-4 flex gap-1 rounded-pastilla border border-tinta-600 bg-tinta-800 p-1 lg:max-w-[560px]">
          {(
            [
              ['validar', 'Validar', porValidar.length],
              ['hoy', 'Hoy', hoy.filter((c) => c.estado === 'confirmada').length],
              ['manana', 'Mañana', manana.length],
              ['proximas', 'Próximas', proximas.length],
            ] as const
          ).map(([clave, etiqueta, n]) => (
            <button
              key={clave}
              onClick={() => setPestana(clave)}
              aria-current={pestana === clave ? 'page' : undefined}
              className={cx(
                'pulsable flex min-h-[48px] flex-1 items-center justify-center whitespace-nowrap rounded-[7px] px-1.5 text-[12.5px] font-medium sm:text-[14px]',
                pestana === clave ? 'bg-laton text-tinta-900' : 'text-hueso-tenue',
              )}
            >
              {etiqueta}
              {n > 0 && (
                <span
                  className={cx(
                    'tabular ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[11px]',
                    pestana === clave ? 'bg-tinta-900/20' : 'bg-tinta-600 text-hueso',
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <div className="mt-4">
            <Aviso tono="error">{error}</Aviso>
          </div>
        )}

        {aviso && (
          <div className="mt-4 rounded-ficha border border-laton-hondo bg-laton-humo p-4">
            <p role="status" className="font-semibold text-hueso">
              {aviso.cita.estado === 'confirmada' ? 'Cita aprobada' : 'Comprobante rechazado'}
              {' · '}{aviso.cita.cliente_nombre} · {aviso.cita.codigo}
            </p>
            <AvisosWhatsApp estado={aviso.cita.estado} telefono={aviso.cita.cliente_telefono}
              datos={{ ...aviso.cita, motivo: aviso.motivo }} />
            <button type="button" onClick={() => setAviso(null)}
              className="pulsable mt-2 min-h-[48px] text-[13px] text-hueso-tenue">Cerrar aviso</button>
          </div>
        )}

        {pestana === 'validar' && porValidar.length > 0 && (
          <p className="mt-4 text-[12.5px] leading-relaxed text-hueso-apagado">
            Mira la captura y compárala con tu Yape antes de confirmar. Una imagen se puede
            falsificar: la validación real es este toque.
          </p>
        )}

        {/* ── Lista ──────────────────────────────────────────────────────
            Una columna en el móvil, dos a partir de `lg`. El barbero valida
            comprobantes desde el celular, pero la agenda del día se mira en
            un portátil, y ahí una sola columna obliga a hacer scroll para ver
            cuatro citas que caben de sobra en la pantalla.

            `items-start` no es decorativo: al desplegar un comprobante la
            tarjeta crece mucho, y sin él estiraría a su vecina de la misma
            fila hasta la misma altura. */}
        {lista.length === 0 ? (
          <div className="mt-4">
            <Vacio pestana={pestana} />
          </div>
        ) : (
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            {lista.map((c, i) => (
              <Tarjeta
                key={c.id}
                cita={c}
                pestana={pestana}
                ocupada={ocupada === c.id}
                indice={i}
                nombreLocal={nombreLocal}
                onAccion={actuar}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ── Tarjeta de cita ───────────────────────────────────────────────────────────

function Tarjeta({
  cita,
  pestana,
  ocupada,
  indice,
  nombreLocal,
  onAccion,
}: {
  cita: CitaPanel
  pestana: Pestana
  ocupada: boolean
  indice: number
  nombreLocal: string
  onAccion: (id: string, a: Accion, motivo?: string) => void
}) {
  const [verCaptura, setVerCaptura] = useState(false)
  const [rechazando, setRechazando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const saldo = cita.precio_centimos - cita.adelanto_centimos
  const cerrada = cita.estado === 'atendida' || cita.estado === 'no_show'

  const datosWa = {
    cliente_nombre: cita.cliente_nombre,
    servicio_nombre: cita.servicio_nombre,
    barbero_nombre: cita.barbero_nombre,
    inicio: cita.inicio,
    codigo: cita.codigo,
    precio_centimos: cita.precio_centimos,
    adelanto_centimos: cita.adelanto_centimos,
  }

  return (
    <article
      style={{ animationDelay: `${Math.min(indice, 8) * 40}ms` }}
      className={cx(
        'animate-aparecer rounded-ficha border border-tinta-600 bg-tinta-800 p-4',
        cerrada && 'opacity-55',
      )}
    >
      {/* Cabecera: hora grande a la izquierda, es lo que se escanea primero.
          En «Próximas» la hora sola no dice nada —pueden ser dentro de tres
          semanas—, así que encima va el día. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {pestana === 'proximas' && (
            <div className="mb-1 text-[12px] font-medium capitalize text-hueso-tenue">
              {fechaLarga(cita.inicio)}
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <span className="tabular font-mono text-[24px] font-semibold leading-none text-laton">
              {hora(cita.inicio)}
            </span>
            <span className="text-[12px] text-hueso-apagado">{cita.duracion_min} min</span>
          </div>
        </div>
        <span className="tabular select-all font-mono text-[12px] text-hueso-apagado">
          {cita.codigo}
        </span>
      </div>

      <div className="mt-2.5">
        <div className="font-semibold text-hueso">{cita.cliente_nombre}</div>
        <div className="mt-0.5 text-[13px] text-hueso-tenue">
          {cita.servicio_nombre}
          {cita.barbero_nombre && (
            <span className="text-hueso-apagado"> · {cita.barbero_nombre}</span>
          )}
        </div>
        {cita.cliente_telefono && (
          <div className="tabular mt-1 select-all font-mono text-[16px] font-medium text-hueso">
            {telefonoLegible(cita.cliente_telefono)}
          </div>
        )}
        {cita.notas && (
          <p className="mt-2 rounded-r-pastilla border-l-2 border-l-tinta-500 bg-tinta-700 px-3 py-2 text-[12.5px] text-hueso-tenue">
            {cita.notas}
          </p>
        )}
      </div>

      {/* Dinero */}
      <div className="tabular mt-3 flex gap-4 border-t border-dashed border-tinta-600 pt-3 font-mono text-[12.5px]">
        <span className="text-hueso-apagado">
          Adelanto <span className="text-hueso">{soles(cita.adelanto_centimos)}</span>
        </span>
        <span className="text-hueso-apagado">
          Saldo <span className="text-hueso">{soles(saldo)}</span>
        </span>
      </div>

      {/* ── POR VALIDAR ─────────────────────────────────────────────────── */}
      {pestana === 'validar' && (
        <>
          <div className="mt-3">
            {cita.captura_url ? (
              <button
                type="button"
                onClick={() => setVerCaptura((v) => !v)}
                className="pulsable w-full rounded-pastilla border border-tinta-600 bg-tinta-700 px-3 py-2.5 text-left text-[13px] text-hueso-tenue"
                aria-expanded={verCaptura}
              >
                {verCaptura ? 'Ocultar comprobante' : 'Ver comprobante'}
              </button>
            ) : (
              <Aviso tono="alerta">
                No se pudo cargar la imagen. Revisa la configuración de R2.
              </Aviso>
            )}

            {verCaptura && cita.captura_url && (
              <div className="mt-2 animate-aparecer overflow-hidden rounded-pastilla border border-tinta-600 bg-tinta-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cita.captura_url}
                  alt={`Comprobante de pago de ${cita.cliente_nombre}`}
                  className="max-h-[70vh] w-full object-contain"
                />
                <p className="border-t border-tinta-600 px-3 py-2 text-[11.5px] text-hueso-apagado">
                  Enlace firmado, caduca en 5 minutos.
                  {cita.captura_subida_en && ` Subido a las ${hora(cita.captura_subida_en)}.`}
                </p>
              </div>
            )}
          </div>

          {rechazando ? (
            <div className="mt-3 flex flex-col gap-2">
              <label htmlFor={`motivo-${cita.id}`} className="text-[12.5px] text-hueso-tenue">
                ¿Qué le decimos? (opcional)
              </label>
              <input
                id={`motivo-${cita.id}`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="El monto no coincide"
                className="min-h-[44px] rounded-pastilla border border-tinta-600 bg-tinta-900 px-3 text-[15px] text-hueso placeholder:text-hueso-apagado"
              />
              <div className="flex gap-2">
                <Boton
                  variante="peligro"
                  className="flex-1"
                  cargando={ocupada}
                  onClick={() => onAccion(cita.id, 'rechazar', motivo || undefined)}
                >
                  Rechazar
                </Boton>
                <Boton variante="fantasma" onClick={() => setRechazando(false)}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Boton
                className="flex-1"
                cargando={ocupada}
                onClick={() => onAccion(cita.id, 'confirmar')}
              >
                Confirmar
              </Boton>
              <Boton variante="peligro" onClick={() => setRechazando(true)}>
                Rechazar
              </Boton>
            </div>
          )}
        </>
      )}

      {/* ── HOY ─────────────────────────────────────────────────────────── */}
      {pestana === 'hoy' && (
        <div className="mt-3">
          {cerrada ? (
            <div
              className={cx(
                'rounded-pastilla px-3 py-2.5 text-center text-[13px] font-medium',
                cita.estado === 'atendida'
                  ? 'bg-exito/10 text-exito'
                  : 'bg-error/10 text-error',
              )}
            >
              {cita.estado === 'atendida' ? 'Atendido' : 'No vino'}
            </div>
          ) : (
            <div className="flex gap-2">
              <Boton
                className="flex-1"
                cargando={ocupada}
                onClick={() => onAccion(cita.id, 'atendida')}
              >
                Atendido · cobrar {soles(saldo)}
              </Boton>
              <Boton variante="peligro" cargando={ocupada} onClick={() => onAccion(cita.id, 'no_show')}>
                No vino
              </Boton>
            </div>
          )}
        </div>
      )}

      <AvisosWhatsApp estado={cita.estado} telefono={cita.cliente_telefono} datos={datosWa} />

      {/* ── CANCELAR ────────────────────────────────────────────────────────
          Discreto y a dos toques: libera el horario y no se puede deshacer.
          No toca el ledger — si hay que devolver el adelanto, es una fila de
          tipo reembolso, y eso lo decides tú, no un botón. */}
      {!cerrada && !rechazando && (
        <div className="mt-3 border-t border-dashed border-tinta-600 pt-3">
          {cancelando ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] leading-relaxed text-hueso-tenue">
                Se cancela la cita y el horario queda libre para otra persona.
                <strong className="text-hueso"> No se puede deshacer.</strong>
                {cita.estado === 'confirmada' && (
                  <>
                    {' '}El adelanto de{' '}
                    <span className="tabular font-mono">{soles(cita.adelanto_centimos)}</span>{' '}
                    ya cobrado no se devuelve solo: si toca reembolsar, regístralo aparte.
                  </>
                )}
              </p>
              <label htmlFor={`cancel-${cita.id}`} className="text-[12.5px] text-hueso-tenue">
                Motivo (queda en el historial)
              </label>
              <input
                id={`cancel-${cita.id}`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="El cliente avisó que no puede venir"
                className="min-h-[44px] rounded-pastilla border border-tinta-600 bg-tinta-900 px-3 text-[15px] text-hueso placeholder:text-hueso-apagado"
              />
              {cita.cliente_telefono && (
                <a
                  href={enlacePara('libre', cita.cliente_telefono, datosWa)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pulsable flex min-h-[44px] items-center justify-center rounded-pastilla border border-tinta-600 text-[13px] text-hueso-tenue"
                >
                  Avisarle por WhatsApp antes
                </a>
              )}
              <div className="flex gap-2">
                <Boton
                  variante="peligro"
                  className="flex-1"
                  cargando={ocupada}
                  onClick={() => onAccion(cita.id, 'cancelar', motivo || undefined)}
                >
                  Sí, cancelar
                </Boton>
                <Boton variante="fantasma" onClick={() => { setCancelando(false); setMotivo('') }}>
                  No
                </Boton>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCancelando(true)}
              className="pulsable min-h-[36px] text-[12.5px] text-hueso-apagado hover:text-error"
            >
              Cancelar cita
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function Vacio({ pestana }: { pestana: Pestana }) {
  const texto = {
    validar: 'Nada por validar. Cuando alguien suba un comprobante, aparecerá aquí.',
    hoy: 'No hay citas confirmadas para hoy.',
    manana: 'No hay citas confirmadas para mañana.',
    proximas: 'No hay citas confirmadas más adelante.',
  }[pestana]

  return (
    <div className="rounded-ficha border border-dashed border-tinta-600 px-4 py-10 text-center text-[13.5px] text-hueso-apagado">
      {texto}
    </div>
  )
}

/** Sólo se usa en el título accesible de la pestaña «Mañana». */
export function tituloManana(fecha: string): string {
  return `${fechaLarga(fecha)} · ${hora12(fecha)}`
}
