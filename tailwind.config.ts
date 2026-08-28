import type { Config } from 'tailwindcss'

/**
 * SISTEMA DE DISEÑO — «EL TURNO»
 *
 * La idea rectora: el artefacto de una barbería no es la tijera, es el
 * papelito con tu número. La interfaz es una FICHA que se va llenando paso a
 * paso y termina en un TICKET PERFORADO. Ese ticket es lo que el cliente
 * captura y comparte, así que es donde va toda la calidad.
 *
 * Se declaran TOKENS, no valores sueltos. Si un color hace falta y no está
 * aquí, se añade aquí — no se escribe un hex en un className.
 *
 *   tinta   Fondo. Azul entintado, nunca #000: el negro puro sobre OLED
 *           produce halos en los bordes y hace ilegible el texto tenue.
 *   laton   Acento. Latón envejecido, no oro brillante ni terracota.
 *           Es el color del metal de una barbería vieja, no de un anuncio.
 *   hueso   Texto. Blanco roto: #FFF sobre fondo oscuro vibra y cansa.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: {
          DEFAULT: '#0D1420', // fondo de página
          900: '#0A1019', // pozos, sombras
          800: '#121A28', // tarjetas
          700: '#18212F', // superficie elevada
          600: '#212C3D', // bordes
          500: '#2E3A4D', // bordes en foco
        },
        hueso: {
          DEFAULT: '#EDE8DF', // texto principal
          tenue: '#97A1B3', // texto secundario
          apagado: '#5F6A7C', // deshabilitado, marcas de agua
        },
        laton: {
          DEFAULT: '#C2A063', // acento
          claro: '#D9BC85', // hover
          hondo: '#8E7141', // activo, bordes del acento
          humo: 'rgba(194,160,99,0.12)', // fondos lavados
        },
        exito: '#4C9A6A',
        alerta: '#D9A441',
        error: '#C7584F',
        // El papel del ticket: es el único elemento claro de la interfaz.
        papel: {
          DEFAULT: '#F2EEE4',
          sombra: '#DED7C7',
          tinta: '#1A1E26',
        },
      },

      fontFamily: {
        // Rótulos en mayúsculas. Condensada y de trazo grueso: es la voz que
        // grita el número de turno.
        display: ['var(--fuente-display)', 'Impact', 'sans-serif'],
        // Cuerpo. Neutra, alta legibilidad a 15px en un celular con 4G.
        sans: ['var(--fuente-sans)', 'system-ui', 'sans-serif'],
        // Horas, códigos y montos. SIEMPRE monoespaciada: los dígitos deben
        // alinearse en columna y no bailar cuando cambia el cronómetro.
        mono: ['var(--fuente-mono)', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        rotulo: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.18em' }],
        turno: ['2.5rem', { lineHeight: '0.95', letterSpacing: '0.02em' }],
      },

      borderRadius: {
        ficha: '14px',
        pastilla: '10px',
      },

      boxShadow: {
        ficha: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        // Halo de latón para el elemento seleccionado.
        elegido: '0 0 0 1px #C2A063, 0 0 0 4px rgba(194,160,99,0.15)',
        ticket: '0 18px 40px -20px rgba(0,0,0,0.75)',
      },

      // Curvas propias: las de CSS son demasiado blandas y las animaciones
      // salen sin intención. Éstas vienen de easing.dev.
      transitionTimingFunction: {
        salida: 'cubic-bezier(0.23, 1, 0.32, 1)',
        vaiven: 'cubic-bezier(0.77, 0, 0.175, 1)',
        cajon: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },

      transitionDuration: {
        pulsar: '140ms',
        panel: '200ms',
      },

      keyframes: {
        aparecer: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Nunca desde scale(0): nada en el mundo real aparece de la nada.
        emerger: {
          from: { opacity: '0', transform: 'scale(0.96) translateY(10px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        latir: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        barrer: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(200%)' },
        },
      },

      animation: {
        aparecer: 'aparecer 260ms cubic-bezier(0.23, 1, 0.32, 1) both',
        emerger: 'emerger 280ms cubic-bezier(0.23, 1, 0.32, 1) both',
        latir: 'latir 1.6s ease-in-out infinite',
        barrer: 'barrer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
