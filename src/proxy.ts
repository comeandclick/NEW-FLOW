import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/reset-password',
  '/admin/login',
  '/api/auth/callback',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession reads from cookie — no network call, fast
  const { data: { session } } = await supabase.auth.getSession()

  const pathname = request.nextUrl.pathname

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/reset-password'
  const isAdminRoute = pathname.startsWith('/admin') && pathname !== '/admin/login'

  if (!session && !isPublic) {
    const redirectUrl = isAdminRoute
      ? new URL('/admin/login', request.url)
      : new URL('/login', request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c.name, c.value))
    return redirectResponse
  }

  if (session && isAuthPage) {
    const redirectResponse = NextResponse.redirect(new URL('/workspaces', request.url))
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c.name, c.value))
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
