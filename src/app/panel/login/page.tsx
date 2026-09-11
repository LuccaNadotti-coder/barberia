'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Aviso, Boton, Campo, Rotulo } from '@/components/ui'
import { clienteNavegador } from '@/lib/sesion-navegador'

export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  )
}

function Login() {
  const router = useRouter()
  const params = useSearchParams()
  const destino = params.get('desde') ?? '/panel'

  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEntrando(true)
    try {
      // @supabase/ssr guarda la sesión en COOKIES, no en localStorage.
      const { error } = await clienteNavegador().auth.signInWithPassword({
        email: email.trim(),
        password: clave,
      })
      if (error) {
        // Mensaje genérico a propósito: distinguir "no existe" de "clave mala"
        // permite averiguar qué correos están dados de alta.
        setError('Correo o contraseña incorrectos.')
        return
      }
      router.replace(destino)
      router.refresh()
    } catch {
      setError('No se pudo conectar. Revisa tu internet.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[380px] flex-col justify-center px-4 py-12 sm:max-w-[420px] sm:px-6">
      <Rotulo>Panel</Rotulo>
      <h1 className="mt-2 font-display text-[32px] uppercase leading-none text-hueso">
        Entra a tu agenda
      </h1>
      <p className="mt-2 text-[13.5px] text-hueso-tenue">
        Sólo para los barberos del local.
      </p>

      <form onSubmit={entrar} className="mt-8 flex flex-col gap-4" noValidate>
        <Campo
          id="email"
          etiqueta="Correo"
          type="email"
          name="email"
          autoComplete="username"
          enterKeyHint="next"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          id="clave"
          etiqueta="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          enterKeyHint="go"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        {error && <Aviso tono="error">{error}</Aviso>}
        <Boton type="submit" cargando={entrando} className="mt-1 w-full">
          Entrar
        </Boton>
      </form>

      <a
        href="/"
        className="pulsable mt-8 inline-flex min-h-[44px] items-center justify-center text-[13px] text-hueso-apagado hover:text-hueso-tenue"
      >
        ← Volver a la web
      </a>
    </main>
  )
}
