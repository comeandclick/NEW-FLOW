import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET /api/social/config — which platforms have OAuth keys configured */
export async function GET() {
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  return NextResponse.json({
    configured: {
      instagram: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
      facebook: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
      tiktok: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
      linkedin: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    },
    encryptReady: !!process.env.SOCIAL_ENCRYPT_KEY,
  })
}
