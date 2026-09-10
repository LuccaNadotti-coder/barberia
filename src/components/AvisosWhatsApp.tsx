import type { EstadoCita } from '@/lib/supabase'
import { enlacePara, type DatosMensaje, type PlantillaWhatsApp } from '@/lib/whatsapp'

/** Abrir un chat no demuestra que se envió un mensaje: no marcamos «enviado». */
export function AvisosWhatsApp({ estado, telefono, datos }: {
  estado: EstadoCita
  telefono: string
  datos: DatosMensaje
}) {
  if (!telefono) return null
  const opciones: [PlantillaWhatsApp, string][] =
    estado === 'en_revision'
      ? [['en_revision', 'Avisar: comprobante en revisión']]
      : estado === 'confirmada'
        ? [['confirmacion', 'Enviar confirmación'], ['recordatorio', 'Recordar fecha y hora']]
        : estado === 'pendiente_pago'
          ? [['rechazo', 'Avisar: corregir comprobante']]
          : []
  if (!opciones.length) return null

  return (
    <section aria-label="Avisos por WhatsApp" className="mt-4 rounded-pastilla border border-exito/40 bg-exito/10 p-3">
      <h3 className="text-[15px] font-semibold text-hueso">Avisar al cliente por WhatsApp</h3>
      <div className="mt-2 flex flex-col gap-2">
        {opciones.map(([plantilla, etiqueta]) => (
          <a key={plantilla} href={enlacePara(plantilla, telefono, datos)}
            target="_blank" rel="noopener noreferrer"
            className="pulsable flex min-h-[48px] items-center justify-center rounded-pastilla border border-exito/40 bg-tinta-800 px-3 py-2 text-center text-[14px] font-semibold text-hueso">
            {etiqueta}
          </a>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-hueso-tenue">
        Abre el chat con el mensaje listo. Revisa el texto y pulsa Enviar en WhatsApp.
      </p>
    </section>
  )
}
