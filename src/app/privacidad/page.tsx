import { Aviso, Rotulo } from '@/components/ui'

export const metadata = {
  title: 'Privacidad',
  description:
    'Qué datos guarda esta web, para qué, quién los ve y cómo pedir que se borren.',
  robots: { index: true, follow: false },
}

const NOMBRE = process.env.NEXT_PUBLIC_NOMBRE_LOCAL || 'Barbería'
const DIRECCION = process.env.NEXT_PUBLIC_DIRECCION_LOCAL || undefined
const CONTACTO = process.env.NEXT_PUBLIC_EMAIL_CONTACTO || undefined

/**
 * AVISO DE PRIVACIDAD — Ley 29733 (Protección de Datos Personales, Perú) y su
 * reglamento (D.S. 003-2013-JUS).
 *
 * Esta página existe porque el sistema guarda nombre, celular, correo y una
 * captura de un pago: eso es tratamiento de datos personales, y la ley obliga a
 * informar antes de recogerlos. No es adorno legal — sin esto el negocio queda
 * expuesto a la ANPD.
 *
 * Está escrita en castellano llano a propósito. Un aviso que nadie entiende no
 * informa, y la ley pide información "de forma clara y expresa".
 */
export default function Privacidad() {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-12 pb-24 sm:px-6">
      <a
        href="/"
        className="text-[13px] text-hueso-apagado underline underline-offset-4 hover:text-hueso-tenue"
      >
        ← Volver
      </a>

      <div className="mt-6">
        <Rotulo>{NOMBRE}</Rotulo>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-hueso">
          Tus datos
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-hueso-tenue">
          Esto explica qué guardamos cuando reservas, para qué sirve, quién lo ve y cómo pedir
          que lo borremos. Se rige por la Ley 29733 de Protección de Datos Personales del Perú.
        </p>
      </div>

      <Seccion titulo="Quién responde por tus datos">
        <p>
          {NOMBRE}
          {DIRECCION ? `, con local en ${DIRECCION}.` : '.'} Somos quienes decidimos qué se
          guarda y para qué.
        </p>
      </Seccion>

      <Seccion titulo="Qué guardamos">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <b className="text-hueso">Tu nombre y tu celular.</b> Sin ellos no sabemos de quién
            es el turno ni cómo avisarte si hay un cambio.
          </li>
          <li>
            <b className="text-hueso">Tu correo, sólo si lo das.</b> Es opcional. Sirve para
            mandarte la confirmación y la cita para tu calendario.
          </li>
          <li>
            <b className="text-hueso">La captura de tu Yape.</b> Es el comprobante del adelanto.
            El barbero la mira para confirmar tu turno.
          </li>
          <li>
            <b className="text-hueso">Los datos de la reserva</b>: servicio, barbero, día, hora,
            precio y si viniste o no.
          </li>
        </ul>
        <p className="mt-3">
          No pedimos DNI, ni dirección, ni datos de tarjeta. No usamos cookies de publicidad ni
          rastreadores de terceros, y no guardamos nada en tu teléfono.
        </p>
      </Seccion>

      <Seccion titulo="Para qué los usamos">
        <p>
          Únicamente para gestionar tu reserva: apartar el horario, verificar el adelanto,
          recordarte la cita el día antes y llevar la cuenta de lo pagado. Nada más.{' '}
          <b className="text-hueso">No mandamos publicidad y no vendemos ni cedemos tus datos
          a nadie.</b>
        </p>
      </Seccion>

      <Seccion titulo="Quién los ve">
        <p>
          Los barberos del local, y cada uno sólo ve las citas que son suyas. Además usamos
          proveedores que almacenan la información por encargo nuestro y no pueden usarla para
          otra cosa:
        </p>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
          <li>Supabase — la base de datos.</li>
          <li>Cloudflare R2 — las capturas de pago, en un depósito privado.</li>
          <li>Resend — el envío de los correos.</li>
          <li>Vercel — el alojamiento de la web.</li>
        </ul>
        <p className="mt-3">
          Estos servicios tienen servidores fuera del Perú, así que tus datos viajan al
          extranjero (flujo transfronterizo). Trabajan bajo contratos que les obligan a
          protegerlos.
        </p>
      </Seccion>

      <Seccion titulo="Cuánto tiempo">
        <p>
          Las reservas y los pagos se conservan mientras seas cliente y después el tiempo que
          exijan las obligaciones contables. Las capturas del Yape se guardan como respaldo del
          cobro. Si pides que borremos tus datos, lo hacemos salvo lo que la ley nos obligue a
          conservar.
        </p>
      </Seccion>

      <Seccion titulo="Qué puedes exigir">
        <p>
          La ley te da los derechos de <b className="text-hueso">acceso, rectificación,
          cancelación y oposición</b>: saber qué tenemos tuyo, corregirlo, pedir que lo
          borremos o negarte a que lo usemos.
        </p>
        <p className="mt-3">
          {CONTACTO ? (
            <>
              Escríbenos a{' '}
              <a
                href={`mailto:${CONTACTO}`}
                className="text-laton underline underline-offset-4"
              >
                {CONTACTO}
              </a>{' '}
              o dilo en el local. Respondemos en los plazos que marca la ley.
            </>
          ) : (
            <>
              Dínoslo en el local o por el WhatsApp con el que te escribimos. Respondemos en los
              plazos que marca la ley.
            </>
          )}
        </p>
        <p className="mt-3">
          Si crees que no te atendimos bien, puedes reclamar ante la Autoridad Nacional de
          Protección de Datos Personales del Ministerio de Justicia.
        </p>
      </Seccion>

      <Seccion titulo="Al reservar">
        <p>
          Cuando envías el formulario nos estás dando tus datos para que gestionemos ese turno.
          Si no quieres dárnoslos, puedes reservar viniendo al local o llamando.
        </p>
      </Seccion>

      <div className="mt-10">
        <Aviso tono="neutro">
          ¿Ya reservaste y perdiste el ticket?{' '}
          <a href="/cita" className="text-laton underline underline-offset-4">
            Recupéralo aquí
          </a>{' '}
          con tu código y tu celular.
        </Aviso>
      </div>
    </main>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-display text-xl uppercase leading-none text-laton">{titulo}</h2>
      <div className="mt-3 text-[14.5px] leading-relaxed text-hueso-tenue">{children}</div>
    </section>
  )
}
