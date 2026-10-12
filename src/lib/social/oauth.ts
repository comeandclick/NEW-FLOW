import type { Platform } from './types'

function resolveBase(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) return url
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'https://new-flow-dashboard.vercel.app'
}
const BASE = resolveBase()

function callbackUrl(platform: Platform) {
  return `${BASE}/api/social/oauth/${platform}/callback`
}

// ── Meta (Instagram + Facebook) ──────────────────────────────────────────────

function metaAuthUrl(wsSlug: string, platform: 'instagram' | 'facebook'): string {
  // instagram_basic deprecated Dec 2024 — use public_profile for both
  const scopes = 'public_profile'
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: callbackUrl(platform),
    scope: scopes,
    response_type: 'code',
    state: `${wsSlug}:${platform}`,
  })
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`
}

export async function metaExchangeCode(code: string, platform: 'instagram' | 'facebook'): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: callbackUrl(platform),
      code,
    }),
  })
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in?: number }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 5183944 }
}

export async function metaLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params}`)
  if (!res.ok) throw new Error(`Meta long-lived token failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in?: number }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 5183944 }
}

export async function metaUserInfo(accessToken: string): Promise<{ id: string; name: string; picture?: string }> {
  const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${accessToken}`)
  const data = await res.json() as { id: string; name: string; picture?: { data?: { url?: string } } }
  return { id: data.id, name: data.name, picture: data.picture?.data?.url }
}

// ── TikTok ───────────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const arr = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(arr).toString('base64url')
}

async function codeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return Buffer.from(hash).toString('base64url')
}

export async function tiktokAuthUrl(wsSlug: string): Promise<{ url: string; verifier: string }> {
  const verifier = generateCodeVerifier()
  const challenge = await codeChallenge(verifier)
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    response_type: 'code',
    scope: 'user.info.basic,video.upload,video.publish',
    redirect_uri: callbackUrl('tiktok'),
    state: wsSlug,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return { url: `https://www.tiktok.com/v2/auth/authorize?${params}`, verifier }
}

export async function tiktokExchangeCode(code: string, verifier: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl('tiktok'),
      code_verifier: verifier,
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`TikTok token exchange failed: ${body}`)
  const raw = JSON.parse(body) as Record<string, unknown>
  // v2 production wraps under .data; sandbox returns at root level
  const d = (raw.data as Record<string, unknown> | undefined) ?? raw
  if (!d.access_token) throw new Error(`TikTok token error: ${body.slice(0, 300)}`)
  return {
    accessToken: d.access_token as string,
    refreshToken: (d.refresh_token as string | undefined) ?? '',
    expiresIn: (d.expires_in as number | undefined) ?? 86400,
  }
}

export async function tiktokUserInfo(accessToken: string): Promise<{ id: string; username: string; displayName: string; avatar: string; followers: number }> {
  const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,username', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const raw2 = await res.json() as Record<string, unknown>
  // v2 production: raw2.data.user; sandbox may return at root or raw2.data directly
  const u = (((raw2.data as Record<string, unknown>)?.user) ?? raw2.data ?? raw2) as Record<string, unknown>
  return {
    id: (u.open_id ?? u.openId ?? '') as string,
    username: (u.username ?? u.display_name ?? u.displayName ?? '') as string,
    displayName: (u.display_name ?? u.displayName ?? u.username ?? '') as string,
    avatar: (u.avatar_url ?? u.avatarUrl ?? '') as string,
    followers: ((u.follower_count ?? u.followerCount ?? 0) as number),
  }
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

export function linkedinAuthUrl(wsSlug: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: callbackUrl('linkedin'),
    scope: 'openid profile email w_member_social',
    state: wsSlug,
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`
}

export async function linkedinExchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl('linkedin'),
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in?: number }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 5184000 }
}

export async function linkedinUserInfo(accessToken: string): Promise<{ id: string; name: string; picture?: string }> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as { sub: string; name: string; picture?: string }
  return { id: data.sub, name: data.name, picture: data.picture }
}

// ── Auth URL dispatcher ───────────────────────────────────────────────────────

export async function getAuthUrl(platform: Platform, wsSlug: string): Promise<{ url: string; verifier?: string }> {
  switch (platform) {
    case 'instagram':
    case 'facebook':
      return { url: metaAuthUrl(wsSlug, platform) }
    case 'tiktok':
      return tiktokAuthUrl(wsSlug)
    case 'linkedin':
      return { url: linkedinAuthUrl(wsSlug) }
  }
}
