import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/social/crypto'
import { metaExchangeCode, metaLongLivedToken, metaUserInfo, tiktokExchangeCode, tiktokUserInfo, linkedinExchangeCode, linkedinUserInfo } from '@/lib/social/oauth'
import type { Platform } from '@/lib/social/types'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'

export async function GET(req: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // wsSlug or "wsSlug:platform"
  const errorParam = url.searchParams.get('error')

  if (errorParam) return NextResponse.redirect(`${BASE}/app/_/social/accounts?error=${encodeURIComponent(errorParam)}`)
  if (!code) return NextResponse.redirect(`${BASE}/app/_/social/accounts?error=no_code`)

  const wsSlug = (state ?? '').split(':')[0]
  if (!wsSlug) return NextResponse.redirect(`${BASE}/?error=bad_state`)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.redirect(`${BASE}/login`)

  const admin = getAdminDb()
  const { data: ws } = await admin.from('workspaces').select('id').eq('slug', wsSlug).single()
  if (!ws) return NextResponse.redirect(`${BASE}/app/${wsSlug}/social/accounts?error=workspace_not_found`)

  try {
    let accountData: {
      platform: Platform
      externalId: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      followers: number
      accessTokenEnc: string
      refreshTokenEnc: string | null
      expiresAt: string | null
      scopes: string[]
    }

    const store = await cookies()

    if (platform === 'instagram' || platform === 'facebook') {
      const { accessToken: shortToken, expiresIn } = await metaExchangeCode(code, platform as 'instagram' | 'facebook')
      const { accessToken, expiresIn: longExpiry } = await metaLongLivedToken(shortToken)
      const userInfo = await metaUserInfo(accessToken)
      const enc = await encryptToken(accessToken)
      accountData = {
        platform: platform as Platform,
        externalId: userInfo.id,
        username: userInfo.name,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture ?? null,
        followers: 0,
        accessTokenEnc: enc,
        refreshTokenEnc: null,
        expiresAt: new Date(Date.now() + longExpiry * 1000).toISOString(),
        scopes: platform === 'instagram' ? ['instagram_basic', 'instagram_content_publish'] : ['pages_manage_posts'],
      }
      void expiresIn
    } else if (platform === 'tiktok') {
      const verifier = store.get(`soc_pkce_tiktok`)?.value
      if (!verifier) return NextResponse.redirect(`${BASE}/app/${wsSlug}/social/accounts?error=pkce_missing`)
      const { accessToken, refreshToken, expiresIn } = await tiktokExchangeCode(code, verifier)
      store.delete(`soc_pkce_tiktok`)
      const userInfo = await tiktokUserInfo(accessToken)
      const [encAccess, encRefresh] = await Promise.all([encryptToken(accessToken), encryptToken(refreshToken)])
      accountData = {
        platform: 'tiktok',
        externalId: userInfo.id,
        username: userInfo.username,
        displayName: userInfo.displayName,
        avatarUrl: userInfo.avatar,
        followers: userInfo.followers,
        accessTokenEnc: encAccess,
        refreshTokenEnc: encRefresh,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scopes: ['user.info.basic', 'video.publish'],
      }
    } else if (platform === 'linkedin') {
      const { accessToken, expiresIn } = await linkedinExchangeCode(code)
      const userInfo = await linkedinUserInfo(accessToken)
      const enc = await encryptToken(accessToken)
      accountData = {
        platform: 'linkedin',
        externalId: userInfo.id,
        username: userInfo.name,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture ?? null,
        followers: 0,
        accessTokenEnc: enc,
        refreshTokenEnc: null,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scopes: ['openid', 'profile', 'email', 'w_member_social'],
      }
    } else {
      return NextResponse.redirect(`${BASE}/app/${wsSlug}/social/accounts?error=unknown_platform`)
    }

    await admin.from('social_accounts').upsert({
      workspace_id: ws.id,
      platform: accountData.platform,
      external_id: accountData.externalId,
      username: accountData.username,
      display_name: accountData.displayName,
      avatar_url: accountData.avatarUrl,
      followers: accountData.followers,
      access_token_enc: accountData.accessTokenEnc,
      refresh_token_enc: accountData.refreshTokenEnc,
      expires_at: accountData.expiresAt,
      scopes: accountData.scopes,
      is_active: true,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,platform,external_id' })

    return NextResponse.redirect(`${BASE}/app/${wsSlug}/social/accounts?connected=${platform}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Social OAuth callback error:', msg)
    return NextResponse.redirect(`${BASE}/app/${wsSlug}/social/accounts?error=${encodeURIComponent(msg.slice(0, 200))}`)
  }
}
