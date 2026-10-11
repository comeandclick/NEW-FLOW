import { NextResponse, type NextRequest } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { safePath } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app'
  if (code) {
    const db = await getServerDb()
    const { error } = await db.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${safePath(next)}`)
  }
  return NextResponse.redirect(`${origin}/login`)
}
