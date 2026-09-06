'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cuentaAtras, fechaLarga, hora, hora12, proximosDias, soles } from '@/lib/fechas'
import type { BarberoPublico, Reserva, Servicio } from '@/lib/supabase'
import { telefonoLegible } from '@/lib/validacion'
import { Ticket } from './Ticket'
import { Turnstile } from './Turnstile'
import { Aviso, Boton, Campo, Girador, Opcion, Rotulo, cx } from './ui'

/**
 * FLUJO DE RESERVA — 5 pasos + ticket.
 *
 * Mobile-first estricto: la inmensa mayoría de las reservas entran desde un
 * celular con 4G. Todo lo que se pueda tocar mide 48 px mínimo, los días y
 * las horas van en franjas horizontales con scroll-snap, y no se carga ni un
 * byte que no haga falta (la compresión de imagen se importa cuando el
 * usuario elige el archivo, no antes).
 *
 * Sin localStorage ni sessionStorage: el estado vive en React y punto. Si la
 * persona recarga, pierde el borrador — a cambio, no dejamos datos personales
 * en el disco de un teléfono que puede ser compartido.
 */

const PASOS = ['Servicio', 'Barbero', 'Hora', 'Datos', 'Pago'] as const

interface Props {
  servicios: Servicio[]
  barberos: BarberoPublico[]
  nombreLocal: string
  direccion?: string
  yapeQrUrl?: string
  turnstileSiteKey?: string
  /**
   * Reserva ya existente, recuperada en /cita con código + celular. Si viene,
   * el flujo arranca directamente en la pantalla de pago (o en el ticket, si
   * la captura ya estaba subida) en vez de en el paso 1.
   */
  reservaInicial?: Reserva
}

interface Formulario {
  nombre: string
  telefono: string
  email: string
  notas: string
}

export function FlujoReserva({
  servicios,
  barberos,
  nombreLocal,
  direccion,
  yapeQrUrl,
  turnstileSiteKey,
  reservaInicial,
}: Props) {
  // Una reserva recuperada ya pasó por los pasos 1-4. Si además tiene la
  // captura subida, lo único que queda por enseñar es el ticket.
  const yaSubida =
    reservaInicial?.estado === 'en_revision' || reservaInicial?.estado === 'confirmada'

  const [paso, setPaso] = useState(reservaInicial ? (yaSubida ? 5 : 4) : 0)

  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [barbero, setBarbero] = useState<BarberoPublico | null>(null)
  const [dia, setDia] = useState<string | null>(null)
  const [inicio, setInicio] = useState<string | null>(null)

  const [horas, setHoras] = useState<string[] | null>(null)
  const [cargandoHoras, setCargandoHoras] = useState(false)

  const [form, setForm] = useState<Formulario>({ nombre: '', telefono: '', email: '', notas: '' })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [reserva, setReserva] = useState<Reserva | null>(reservaInicial ?? null)
  const [estadoFinal, setEstadoFinal] = useState<'en_revision' | 'confirmada' | null>(
    yaSubida ? (reservaInicial!.estado as 'en_revision' | 'confirmada') : null,
  )

  const dias = useMemo(() => proximosDias(14), [])
  const cima = useRef<HTMLDivElement>(null)

  // Al cambiar de paso, llevar el foco arriba: si no, en un móvil el usuario
  // se queda mirando el final de la lista anterior.
  useEffect(() => {
    cima.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [paso])

  // ── Disponibilidad ──────────────────────────────────────────────────────────
  const cargarHoras = useCallback(
    async (señal?: AbortSignal) => {
      if (!servicio || !barbero || !dia) return
      setCargandoHoras(true)
      setHoras(null)
      try {
        const q = new URLSearchParams({
          barbero_id: barbero.id,
          servicio_id: servicio.id,
          fecha: dia,
        })
        const r = await fetch(`/api/disponibilidad?${q}`, { signal: señal })
        const j = (await r.json()) as { horas?: string[]; error?: string }
        if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar la disponibilidad')
        setHoras(j.horas ?? [])
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setHoras([])
        setErrorGeneral((e as Error).message)
      } finally {
        setCargandoHoras(false)
      }
    },
    [servicio, barbero, dia],
  )

  useEffect(() => {
    if (paso !== 2 || !dia) return
    const ac = new AbortController()
    void cargarHoras(ac.signal)
    return () => ac.abort()
  }, [paso, dia, cargarHoras])

  // ── Cronómetro de 15 minutos ────────────────────────────────────────────────
  const [restante, setRestante] = useState<number>(0)
  useEffect(() => {
    if (!reserva?.expira_en || estadoFinal) return
    const vence = new Date(reserva.expira_en).getTime()
    const tic = () => setRestante(vence - Date.now())
    tic()
    const id = setInterval(tic, 1000)
    return () => clearInterval(id)
  }, [reserva, estadoFinal])

  const expirado = Boolean(reserva) && !estadoFinal && restante <= 0

  // ── Envío de la reserva ─────────────────────────────────────────────────────
  const [tokenTurnstile, setTokenTurnstile] = useState<string | null>(null)

  async function enviarReserva(e: React.FormEvent) {
    e.preventDefault()
    if (!servicio || !barbero || !inicio) return

    setErrores({})
    setErrorGeneral(null)
    setEnviando(true)

    try {
      const r = await fetch('/api/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicio_id: servicio.id,
          barbero_id: barbero.id,
          inicio,
          nombre: form.nombre,
          telefono: form.telefono,
          email: form.email || undefined,
          notas: form.notas || undefined,
          turnstile: tokenTurnstile ?? undefined,
          // Aquí NO va el precio. Lo congela la base de datos.
        }),
      })

      const j = (await r.json()) as {
        reserva?: Reserva
        error?: string
        campos?: Record<string, string>
        conflicto?: boolean
      }

      if (!r.ok) {
        if (j.campos) setErrores(j.campos)
        setErrorGeneral(j.error ?? 'No se pudo crear la reserva')
        // Si alguien se llevó el slot mientras rellenaba, hay que volver a
        // elegir hora: dejarlo en este paso sería un callejón sin salida.
        if (j.conflicto) {
          setInicio(null)
          setPaso(2)
          void cargarHoras()
        }
        return
      }

      setReserva(j.reserva!)
      setPaso(4)
    } catch {
      setErrorGeneral('Sin conexión. Revisa tus datos móviles e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  // ── Subida de la captura ────────────────────────────────────────────────────
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  async function subirCaptura(archivo: File) {
    if (!reserva) return
    setErrorGeneral(null)
    setSubiendo(true)

    try {
      // Comprimir EN EL NAVEGADOR antes de subir: una captura de pantalla de
      // un móvil moderno pesa 2-4 MB, y por 4G eso son 20 segundos y datos
      // del cliente. A webp ~100 KB se sube en menos de uno.
      setProgreso('Optimizando imagen…')
      const { default: comprimir } = await import('browser-image-compression')
      const comprimida = await comprimir(archivo, {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 1400,
        fileType: 'image/webp',
        useWebWorker: true,
        initialQuality: 0.82,
      })

      setProgreso('Subiendo…')
      const fd = new FormData()
      fd.set('cita_id', reserva.id)
      fd.set('codigo', reserva.codigo)
      fd.set('archivo', comprimida, 'captura.webp')

      const r = await fetch('/api/captura', { method: 'POST', body: fd })
      const j = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(j.error ?? 'No se pudo subir la captura')

      setEstadoFinal('en_revision')
      setPaso(5)
    } catch (e) {
      setErrorGeneral((e as Error).message)
    } finally {
      setSubiendo(false)
      setProgreso(null)
      if (entrada.current) entrada.current.value = ''
    }
  }

  function reiniciar() {
    setPaso(0)
    setServicio(null)
    setBarbero(null)
    setDia(null)
    setInicio(null)
    setHoras(null)
    setReserva(null)
    setEstadoFinal(null)
    setErrorGeneral(null)
    setErrores({})
    setForm({ nombre: '', telefono: '', email: '', notas: '' })
  }

  // ═══ Pantalla final ═════════════════════════════════════════════════════════
  if (paso === 5 && reserva && estadoFinal) {
    return (
      <div ref={cima} className="px-4 py-8">
        <div className="mx-auto max-w-[360px] pb-6 text-center">
          <Rotulo>{estadoFinal === 'confirmada' ? 'Confirmada' : 'Listo'}</Rotulo>
          <h1 className="mt-2 font-display text-3xl uppercase leading-none text-hueso">
            {estadoFinal === 'confirmada' ? 'Te esperamos' : 'Recibimos tu pago'}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-hueso-tenue">
            {estadoFinal === 'confirmada' ? (
              <>
                {reserva.barbero_nombre} ya validó tu adelanto. Guarda el código y preséntalo al
                llegar.
              </>
            ) : (
              <>
                {reserva.barbero_nombre} va a revisar tu comprobante y te confirma en un rato.
                {reserva.cliente_email && ' Te avisamos por correo.'}
              </>
            )}
          </p>
        </div>

        <Ticket
          reserva={reserva}
          estado={estadoFinal}
          nombreLocal={nombreLocal}
          direccion={direccion}
        />

        <div className="mx-auto mt-8 max-w-[360px]">
          <Boton variante="secundario" className="w-full" onClick={reiniciar}>
            Reservar otra cita
          </Boton>
        </div>
      </div>
    )
  }

  // ═══ Flujo ══════════════════════════════════════════════════════════════════
  return (
    <div className="px-4 pb-24 pt-6">
      <div ref={cima} className="mx-auto max-w-[440px]">
        <Progreso paso={paso} />

        {errorGeneral && paso !== 4 && (
          <div className="mt-4">
            <Aviso tono="error">{errorGeneral}</Aviso>
          </div>
        )}

        {/* ── PASO 1 · SERVICIO ──────────────────────────────────────────── */}
        {paso === 0 && (
          <Seccion titulo="¿Qué te hacemos?" sub="Elige un servicio para empezar.">
            <div className="flex flex-col gap-2.5">
              {servicios.map((s, i) => (
                <Opcion
                  key={s.id}
                  elegida={servicio?.id === s.id}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className="animate-aparecer"
                  onClick={() => {
                    setServicio(s)
                    setInicio(null)
                    setPaso(1)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-hueso">{s.nombre}</div>
                      {s.descripcion && (
                        <p className="mt-0.5 text-[13px] leading-snug text-hueso-tenue">
                          {s.descripcion}
                        </p>
                      )}
                      <div className="tabular mt-1.5 font-mono text-[12px] text-hueso-apagado">
                        {s.duracion_min} min
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tabular font-mono text-[17px] font-semibold text-laton">
                        {soles(s.precio_centimos)}
                      </div>
                      <div className="tabular mt-0.5 font-mono text-[11px] text-hueso-apagado">
                        adelanto {soles(Math.round((s.precio_centimos * s.adelanto_pct) / 100))}
                      </div>
                    </div>
                  </div>
                </Opcion>
              ))}
            </div>
          </Seccion>
        )}

        {/* ── PASO 2 · BARBERO ───────────────────────────────────────────── */}
        {paso === 1 && (
          <Seccion titulo="¿Con quién?" sub="Los dos cortan igual de bien.">
            <div className="grid grid-cols-2 gap-2.5">
              {barberos.map((b, i) => (
                <Opcion
                  key={b.id}
                  elegida={barbero?.id === b.id}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className="animate-aparecer text-center"
                  onClick={() => {
                    setBarbero(b)
                    setInicio(null)
                    setDia((d) => d ?? (dias[0]?.iso ?? null))
                    setPaso(2)
                  }}
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-tinta-600 bg-tinta-700 font-display text-xl text-laton">
                    {b.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="mt-2.5 font-semibold text-hueso">{b.nombre}</div>
                </Opcion>
              ))}
            </div>
            <Volver a={() => setPaso(0)} />
          </Seccion>
        )}

        {/* ── PASO 3 · DÍA Y HORA ────────────────────────────────────────── */}
        {paso === 2 && servicio && barbero && (
          <Seccion
            titulo="¿Cuándo?"
            sub={`${servicio.nombre} con ${barbero.nombre} · ${servicio.duracion_min} min`}
          >
            <div>
              <Rotulo className="mb-2">Día</Rotulo>
              <div className="franja -mx-4 px-4">
                {dias.map((d) => {
                  const elegido = dia === d.iso
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      aria-pressed={elegido}
                      onClick={() => {
                        setDia(d.iso)
                        setInicio(null)
                      }}
                      className={cx(
                        'pulsable flex min-h-[76px] w-[60px] flex-col items-center justify-center rounded-pastilla border',
                        elegido
                          ? 'border-laton bg-laton-humo shadow-elegido'
                          : 'border-tinta-600 bg-tinta-800',
                      )}
                    >
                      <span className="text-[11px] uppercase tracking-wide text-hueso-tenue">
                        {d.esHoy ? 'hoy' : d.esManana ? 'mañ' : d.diaSemana}
                      </span>
                      <span
                        className={cx(
                          'tabular font-mono text-[19px] font-semibold',
                          elegido ? 'text-laton' : 'text-hueso',
                        )}
                      >
                        {d.diaMes}
                      </span>
                      <span className="text-[10px] uppercase text-hueso-apagado">{d.mes}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-6">
              <Rotulo className="mb-2">Hora</Rotulo>

              {cargandoHoras && (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="esqueleto h-[46px] rounded-pastilla" />
                  ))}
                </div>
              )}

              {!cargandoHoras && horas && horas.length === 0 && (
                <Aviso tono="alerta">
                  No queda ningún hueco ese día con {barbero.nombre}. Prueba otro día, o cambia
                  de barbero.
                </Aviso>
              )}

              {!cargandoHoras && horas && horas.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {horas.map((h, i) => {
                    const elegida = inicio === h
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={elegida}
                        style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
                        onClick={() => {
                          setInicio(h)
                          setPaso(3)
                        }}
                        className={cx(
                          'pulsable tabular animate-aparecer min-h-[46px] rounded-pastilla border font-mono text-[14px]',
                          elegida
                            ? 'border-laton bg-laton-humo text-laton shadow-elegido'
                            : 'border-tinta-600 bg-tinta-800 text-hueso',
                        )}
                      >
                        {hora(h)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Volver a={() => setPaso(1)} />
          </Seccion>
        )}

        {/* ── PASO 4 · DATOS ─────────────────────────────────────────────── */}
        {paso === 3 && servicio && barbero && inicio && (
          <Seccion titulo="Tus datos" sub="Sólo para avisarte. No mandamos publicidad.">
            <Resumen
              servicio={servicio}
              barbero={barbero.nombre}
              inicio={inicio}
            />

            <form onSubmit={enviarReserva} className="mt-5 flex flex-col gap-4" noValidate>
              <Campo
                id="nombre"
                etiqueta="Nombre"
                name="nombre"
                autoComplete="given-name"
                enterKeyHint="next"
                placeholder="Ana Torres"
                required
                value={form.nombre}
                error={errores.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
              <Campo
                id="telefono"
                etiqueta="Celular"
                name="telefono"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                enterKeyHint="next"
                placeholder="987 654 321"
                required
                value={form.telefono}
                error={errores.telefono}
                ayuda="9 dígitos. Te escribimos por aquí si hay algún cambio."
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
              <Campo
                id="email"
                etiqueta="Correo (opcional)"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="done"
                placeholder="ana@correo.com"
                value={form.email}
                error={errores.email}
                ayuda="Si lo dejas, te mandamos la cita para tu calendario."
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />

              {turnstileSiteKey && (
                <Turnstile siteKey={turnstileSiteKey} onToken={setTokenTurnstile} />
              )}

              {errorGeneral && <Aviso tono="error">{errorGeneral}</Aviso>}

              <Boton type="submit" cargando={enviando} className="mt-1 w-full">
                {enviando ? 'Reservando…' : 'Reservar y pagar adelanto'}
              </Boton>

              <p className="text-center text-[12px] leading-relaxed text-hueso-apagado">
                Al reservar guardamos tu horario por{' '}
                <strong className="text-hueso-tenue">15 minutos</strong> mientras haces el Yape.
              </p>

              {/* Ley 29733: hay que informar ANTES de recoger los datos, no
                  después. Va aquí, pegado al botón, y no escondido en un pie. */}
              <p className="text-center text-[12px] leading-relaxed text-hueso-apagado">
                Usamos tu nombre y celular sólo para gestionar este turno.{' '}
                <a
                  href="/privacidad"
                  target="_blank"
                  rel="noopener"
                  className="text-hueso-tenue underline underline-offset-4"
                >
                  Cómo tratamos tus datos
                </a>
                .
              </p>
            </form>

            <Volver a={() => setPaso(2)} />
          </Seccion>
        )}

        {/* ── PASO 5 · PAGO ──────────────────────────────────────────────── */}
        {paso === 4 && reserva && (
          <Seccion
            titulo="Paga el adelanto"
            sub={`Yapea ${soles(reserva.adelanto_centimos)} y sube la captura aquí mismo.`}
          >
            <Cronometro restante={restante} expirado={expirado} />

            {expirado ? (
              <div className="mt-4 flex flex-col gap-4">
                <Aviso tono="error">
                  Se acabaron los 15 minutos y liberamos el horario para otra persona. No se te
                  cobró nada.
                </Aviso>
                <Boton className="w-full" onClick={reiniciar}>
                  Volver a reservar
                </Boton>
              </div>
            ) : (
              <>
                {/* Datos del Yape */}
                <div className="mt-4 rounded-ficha border border-tinta-600 bg-tinta-800 p-5 text-center">
                  {yapeQrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={yapeQrUrl}
                      alt={`Código QR de Yape de ${reserva.yape_titular ?? nombreLocal}`}
                      width={196}
                      height={196}
                      className="mx-auto rounded-pastilla bg-white p-2"
                    />
                  ) : (
                    <div className="mx-auto flex h-[196px] w-[196px] items-center justify-center rounded-pastilla border border-dashed border-tinta-500 text-[12px] leading-relaxed text-hueso-apagado">
                      Yapea al número
                      <br />
                      de abajo
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-hueso-apagado">
                      Yape
                    </div>
                    <div className="tabular mt-1 select-all font-mono text-[22px] font-semibold text-hueso">
                      {reserva.yape_numero ? telefonoLegible(`51${reserva.yape_numero}`) : '—'}
                    </div>
                    {reserva.yape_titular && (
                      <div className="mt-0.5 text-[13px] text-hueso-tenue">
                        {reserva.yape_titular}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-dashed border-tinta-600 pt-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-hueso-apagado">
                      Monto exacto
                    </div>
                    <div className="tabular mt-0.5 font-mono text-turno font-semibold text-laton">
                      {soles(reserva.adelanto_centimos)}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-dashed border-tinta-600 pt-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-hueso-apagado">
                      Tu código
                    </div>
                    <div className="tabular mt-0.5 select-all font-mono text-[20px] font-semibold text-hueso">
                      {reserva.codigo}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-center text-[12.5px] leading-relaxed text-hueso-apagado">
                  Pon <strong className="text-hueso-tenue">{reserva.codigo}</strong> en el mensaje
                  del Yape. Así {reserva.barbero_nombre} lo encuentra a la primera.
                </p>

                {errorGeneral && (
                  <div className="mt-4">
                    <Aviso tono="error">{errorGeneral}</Aviso>
                  </div>
                )}

                {/* Subida */}
                <div className="mt-5">
                  <input
                    ref={entrada}
                    id="captura"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void subirCaptura(f)
                    }}
                  />
                  <Boton
                    className="w-full"
                    cargando={subiendo}
                    onClick={() => entrada.current?.click()}
                  >
                    {subiendo ? (progreso ?? 'Subiendo…') : 'Subir captura del Yape'}
                  </Boton>
                  <p className="mt-2 text-center text-[12px] text-hueso-apagado">
                    JPG, PNG o WEBP · máximo 5 MB
                  </p>
                </div>

                <div className="mt-5">
                  <Aviso>
                    Tu cita se confirma cuando {reserva.barbero_nombre} revise el comprobante.
                    No es automático: alguien lo mira de verdad.
                  </Aviso>
                </div>
              </>
            )}
          </Seccion>
        )}
      </div>
    </div>
  )
}

// ── Piezas ────────────────────────────────────────────────────────────────────

function Seccion({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6">
      <h1 className="font-display text-[30px] uppercase leading-none text-hueso">{titulo}</h1>
      {sub && <p className="mt-1.5 text-[13.5px] leading-relaxed text-hueso-tenue">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Progreso({ paso }: { paso: number }) {
  return (
    <nav aria-label="Progreso de la reserva">
      <ol className="flex gap-1.5">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <div
              className={cx(
                'h-[3px] rounded-full transition-colors duration-panel ease-salida',
                i < paso ? 'bg-laton' : i === paso ? 'bg-laton/60' : 'bg-tinta-600',
              )}
            />
            <div
              className={cx(
                'mt-1.5 text-[10px] uppercase tracking-[0.1em] transition-colors duration-panel',
                i === paso ? 'text-laton' : 'text-hueso-apagado',
              )}
            >
              {p}
            </div>
          </li>
        ))}
      </ol>
      <span className="sr-only" aria-live="polite">
        Paso {paso + 1} de {PASOS.length}: {PASOS[paso]}
      </span>
    </nav>
  )
}

function Volver({ a }: { a: () => void }) {
  return (
    <button
      type="button"
      onClick={a}
      className="pulsable mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] text-hueso-tenue hover:text-hueso"
    >
      <span aria-hidden>←</span> Atrás
    </button>
  )
}

function Resumen({
  servicio,
  barbero,
  inicio,
}: {
  servicio: Servicio
  barbero: string
  inicio: string
}) {
  const adelanto = Math.round((servicio.precio_centimos * servicio.adelanto_pct) / 100)
  return (
    <div className="rounded-ficha border border-tinta-600 bg-tinta-800 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-hueso">{servicio.nombre}</span>
        <span className="tabular font-mono text-[15px] text-laton">
          {soles(servicio.precio_centimos)}
        </span>
      </div>
      <div className="mt-1 text-[13px] text-hueso-tenue">
        {barbero} · {capitalizar(fechaLarga(inicio))} · {hora12(inicio)}
      </div>
      <div className="mt-3 border-t border-dashed border-tinta-600 pt-3 text-[13px]">
        <span className="text-hueso-tenue">Adelanto por Yape</span>
        <span className="tabular float-right font-mono font-semibold text-hueso">
          {soles(adelanto)}
        </span>
      </div>
    </div>
  )
}

/**
 * El cronómetro. Cambia de color en el último tercio para que la urgencia se
 * vea sin tener que leer los números. Los dígitos son tabulares: si no, el
 * texto se mueve cada segundo y el ojo se va allí.
 */
function Cronometro({ restante, expirado }: { restante: number; expirado: boolean }) {
  const urgente = !expirado && restante < 5 * 60_000

  return (
    <div
      className={cx(
        'flex items-center justify-between rounded-pastilla border px-4 py-3',
        expirado
          ? 'border-error/40 bg-error/10'
          : urgente
            ? 'border-alerta/40 bg-alerta/10'
            : 'border-tinta-600 bg-tinta-800',
      )}
    >
      <span className="text-[12.5px] text-hueso-tenue">
        {expirado ? 'Horario liberado' : 'Tu horario está guardado'}
      </span>
      <span
        aria-live={urgente ? 'polite' : 'off'}
        className={cx(
          'tabular font-mono text-[19px] font-semibold',
          expirado ? 'text-error' : urgente ? 'text-alerta' : 'text-hueso',
        )}
      >
        {cuentaAtras(Math.max(0, restante))}
      </span>
    </div>
  )
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
