import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieAEscribir = { name: string; value: string; options?: CookieOptions }

/**
 * Refresca la cookie de sesión en cada navegación y cierra /panel a quien no
 * tenga sesión. La comprobación de QUÉ ve cada barbero no está aquí: eso lo
 * hace el RLS de la base. Esto sólo evita pintar una pantalla vacía.
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return res

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista: CookieAEscribir[]) => {
        for (const { name, value } of lista) req.cookies.set(name, value)
        res = NextResponse.next({ request: req })
        for (const { name, value, options } of lista) res.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ruta = req.nextUrl.pathname
  const esPanel = ruta.startsWith('/panel') && ruta !== '/panel/login'

  if (esPanel && !user) {
    const destino = req.nextUrl.clone()
    destino.pathname = '/panel/login'
    destino.searchParams.set('desde', ruta)
    return NextResponse.redirect(destino)
  }

  if (ruta === '/panel/login' && user) {
    const destino = req.nextUrl.clone()
    destino.pathname = '/panel'
    destino.search = ''
    return NextResponse.redirect(destino)
  }

  return res
}

export const config = {
  matcher: ['/panel/:path*'],
}
