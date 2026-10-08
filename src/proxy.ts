import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_PAGES = ['/login', '/register', '/reset']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isDemo = request.cookies.get('flow_demo')?.value === '1'
  const isApp = pathname === '/app' || pathname.startsWith('/app/')
  const isAuthPage = AUTH_PAGES.includes(pathname)

  if (!isApp && !isAuthPage) return NextResponse.next()
  if (isDemo) return isAuthPage ? NextResponse.redirect(new URL('/app', request.url)) : NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && isApp) {
    const url = new URL('/login', request.url)
    return NextResponse.redirect(url)
  }
  if (session && isAuthPage) return NextResponse.redirect(new URL('/app', request.url))
  return response
}

export const config = {
  matcher: ['/app/:path*', '/login', '/register', '/reset'],
}
