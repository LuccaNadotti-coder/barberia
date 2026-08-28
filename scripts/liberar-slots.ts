/**
 * CRON · cada 5 minutos
 *
 * Libera las reservas que llevan más de 15 minutos en 'pendiente_pago' sin
 * captura. Sin esto, cada persona que abandona el flujo a mitad deja un
 * horario muerto: el EXCLUDE lo sigue considerando ocupado y nadie más puede
 * reservarlo.
 *
 * Toda la lógica está en la RPC liberar_vencidas(): este archivo sólo la
 * llama. Así la regla vive en la base y no depende de que el cron corra.
 */

import './entorno-local' // no-op en CI; en local carga .env.local
import { createClient } from '@supabase/supabase-js'

function requerida(n: string): string {
  const v = process.env[n]
  if (!v) {
    console.error(`Falta la variable de entorno ${n}`)
    process.exit(1)
  }
  return v
}

async function main() {
  const sb = createClient(
    requerida('NEXT_PUBLIC_SUPABASE_URL'),
    requerida('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const { data, error } = await sb.rpc('liberar_vencidas')

  if (error) {
    console.error('[liberar-slots] error:', error.message)
    process.exit(1)
  }

  const n = typeof data === 'number' ? data : 0
  console.log(
    n === 0
      ? '[liberar-slots] nada que liberar'
      : `[liberar-slots] ${n} reserva(s) liberada(s)`,
  )
}

main().catch((e) => {
  console.error('[liberar-slots] fallo inesperado:', e)
  process.exit(1)
})
