import { NextRequest, NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/social/oauth'
import { platformConfigured, type Platform } from '@/lib/social/types'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin']

/** GET /api/social/oauth/[platform]?ws=<slug> — initiate OAuth */
export async function GET(req: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params
  if (!PLATFORMS.includes(platform as Platform)) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 })

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const wsSlug = req.nextUrl.searchParams.get('ws')
  if (!wsSlug) return NextResponse.json({ error: 'ws required' }, { status: 400 })

  if (!platformConfigured(platform as Platform)) {
    return NextResponse.json({ error: 'OAuth keys not configured for this platform' }, { status: 501 })
  }

  const { url, verifier } = await getAuthUrl(platform as Platform, wsSlug)

  if (verifier) {
    const store = await cookies()
    store.set(`soc_pkce_${platform}`, verifier, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 })
  }

  return NextResponse.redirect(url)
}
