import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function cx(...v: (string | false | null | undefined)[]): string {
  return v.filter(Boolean).join(' ')
}

/** Rótulo en mayúsculas con tracking abierto. La voz de la marca. */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('font-display uppercase text-rotulo text-laton', className)}>
      {children}
    </div>
  )
}

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro'

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-laton text-tinta-900 hover:bg-laton-claro border border-laton',
  secundario: 'bg-tinta-700 text-hueso border border-tinta-600 hover:bg-tinta-600',
  fantasma: 'bg-transparent text-hueso-tenue border border-transparent hover:text-hueso',
  peligro: 'bg-transparent text-error border border-error/40 hover:bg-error/10',
}

export function Boton({
  variante = 'primario',
  cargando = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBoton
  cargando?: boolean
}) {
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'pulsable inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pastilla',
        'px-5 text-[15px] font-semibold',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTES[variante],
        className,
      )}
    >
      {cargando && <Girador />}
      {children}
    </button>
  )
}

/** Un giro rápido: un spinner lento hace que la app parezca más lenta. */
export function Girador({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block h-4 w-4 shrink-0 animate-spin rounded-full',
        'border-2 border-current border-r-transparent [animation-duration:600ms]',
        className,
      )}
    />
  )
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string
  error?: string
  ayuda?: string
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined
  const idError = error ? `${id}-error` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-hueso-tenue">
        {etiqueta}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(idAyuda, idError) || undefined}
        className={cx(
          'min-h-[48px] w-full rounded-pastilla border bg-tinta-800 px-3.5 text-hueso',
          'placeholder:text-hueso-apagado',
          'transition-colors duration-panel',
          error ? 'border-error' : 'border-tinta-600 focus:border-laton-hondo',
          className,
        )}
      />
      {ayuda && !error && (
        <p id={idAyuda} className="text-xs text-hueso-apagado">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

/** Aviso en bloque. `tono` decide el color del filete izquierdo. */
export function Aviso({
  tono = 'neutro',
  children,
}: {
  tono?: 'neutro' | 'alerta' | 'error' | 'exito'
  children: ReactNode
}) {
  const filete = {
    neutro: 'border-l-laton bg-laton-humo',
    alerta: 'border-l-alerta bg-alerta/10',
    error: 'border-l-error bg-error/10',
    exito: 'border-l-exito bg-exito/10',
  }[tono]

  return (
    <div
      role={tono === 'error' ? 'alert' : undefined}
      className={cx('rounded-r-pastilla border-l-2 px-3.5 py-3 text-[13.5px] leading-relaxed', filete)}
    >
      {children}
    </div>
  )
}

/** Tarjeta seleccionable (servicio, barbero, hora). */
export function Opcion({
  elegida,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { elegida?: boolean }) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={elegida}
      className={cx(
        'pulsable w-full rounded-ficha border bg-tinta-800 p-4 text-left',
        'disabled:cursor-not-allowed disabled:opacity-40',
        elegida ? 'border-laton shadow-elegido' : 'border-tinta-600',
        className,
      )}
    >
      {children}
    </button>
  )
}
