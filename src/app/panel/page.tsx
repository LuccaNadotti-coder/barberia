import { redirect } from 'next/navigation'
import { PanelBarbero, type CitaPanel } from '@/components/PanelBarbero'
import { fechaISO, limitesDelDia, mananaISO } from '@/lib/fechas'
import { urlsFirmadas } from '@/lib/r2'
import { barberoDeSesion, clienteRuta } from '@/lib/sesion'
import { primero, type BarberoAnidado, type ClienteAnidado } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'

/**
 * Panel del barbero.
 *
 * Todas las consultas van con el cliente ATADO A LA SESIÓN. No hay ni un
 * `.eq('barbero_id', …)` filtrando por el barbero actual: eso lo hace el RLS
 * de la tabla `citas`. Si mañana alguien se equivoca aquí, la base sigue sin
 * dejar que un barbero vea la agenda del otro. Y el dueño (es_admin) ve todo
 * sin que este archivo tenga que saberlo.
 *
 * Las capturas se firman EN EL SERVIDOR: la clave secreta de R2 no sale de
 * aquí, y las URLs caducan a los 5 minutos.
 */
export default async function Panel() {
  const sb = clienteRuta()
  const barbero = await barberoDeSesion(sb)
  if (!barbero) redirect('/panel/login')

  const hoy = fechaISO(new Date())
  const manana = mananaISO()
  const limHoy = limitesDelDia(hoy)
  const limManana = limitesDelDia(manana)

  // `barberos!citas_barbero_id_fkey` y no `barberos`: la tabla `citas` tiene
  // DOS claves foráneas hacia `barberos` (barbero_id y confirmada_por). Sin
  // decirle a PostgREST cuál queremos, responde "more than one relationship
  // was found" y el panel entero se queda en blanco.
  const columnas =
    'id, codigo, estado, servicio_nombre, duracion_min, precio_centimos, adelanto_centimos,' +
    ' inicio, fin, captura_path, captura_subida_en, notas, creado_en,' +
    ' clientes(nombre, telefono, email), barberos!citas_barbero_id_fkey(nombre)'

  // La cuarta consulta existe porque sin ella una cita confirmada para pasado
  // mañana no encajaba en NINGUNA de las otras tres y desaparecía del panel: no
  // era sólo que faltara una pestaña, es que nunca se traía de la base.
  const [porValidar, deHoy, deManana, proximas] = await Promise.all([
    sb.from('citas').select(columnas).eq('estado', 'en_revision').order('inicio'),
    sb
      .from('citas')
      .select(columnas)
      .in('estado', ['confirmada', 'atendida', 'no_show'])
      .gte('inicio', limHoy.desde)
      .lt('inicio', limHoy.hasta)
      .order('inicio'),
    sb
      .from('citas')
      .select(columnas)
      .eq('estado', 'confirmada')
      .gte('inicio', limManana.desde)
      .lt('inicio', limManana.hasta)
      .order('inicio'),
    sb
      .from('citas')
      .select(columnas)
      .eq('estado', 'confirmada')
      .gte('inicio', limManana.hasta) // de pasado mañana en adelante
      .order('inicio'),
  ])

  const aplanar = (data: unknown, conFirma = false): CitaPanel[] => {
    const filas = (data ?? []) as Record<string, unknown>[]
    const firmas = conFirma
      ? urlsFirmadas(filas.map((f) => (f.captura_path as string | null) ?? null))
      : filas.map(() => null)

    return filas.map((f, i) => {
      const cliente = primero<ClienteAnidado>(f.clientes as ClienteAnidado | ClienteAnidado[] | null)
      const barb = primero<BarberoAnidado>(f.barberos as BarberoAnidado | BarberoAnidado[] | null)
      return {
        id: f.id as string,
        codigo: f.codigo as string,
        estado: f.estado as CitaPanel['estado'],
        servicio_nombre: f.servicio_nombre as string,
        duracion_min: f.duracion_min as number,
        precio_centimos: f.precio_centimos as number,
        adelanto_centimos: f.adelanto_centimos as number,
        inicio: f.inicio as string,
        fin: f.fin as string,
        notas: (f.notas as string | null) ?? null,
        captura_subida_en: (f.captura_subida_en as string | null) ?? null,
        captura_url: firmas[i] ?? null,
        cliente_nombre: cliente?.nombre ?? '—',
        cliente_telefono: cliente?.telefono ?? '',
        cliente_email: cliente?.email ?? null,
        barbero_nombre: barb?.nombre ?? barbero.nombre,
      }
    })
  }

  return (
    <PanelBarbero
      barbero={barbero}
      nombreLocal={NOMBRE}
      porValidar={aplanar(porValidar.data, true)}
      hoy={aplanar(deHoy.data)}
      manana={aplanar(deManana.data)}
      proximas={aplanar(proximas.data)}
    />
  )
}
