import { NextResponse } from 'next/server'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'
import { safePath } from '@/lib/utils'

export const runtime = 'nodejs'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * E-mails other members of the caller's workspace about a meeting that was scheduled for them.
 * Needs RESEND_API_KEY (and optionally MAIL_FROM); answers 501 until configured so the app can ignore it quietly.
 */
export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY
  if (!key || !process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 501 })
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  let body: { workspaceId?: string; userIds?: string[]; subject?: string; text?: string; when?: string; url?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!body.workspaceId || !Array.isArray(body.userIds) || !body.subject) return NextResponse.json({ ok: false }, { status: 400 })

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (rateLimited(`mail:${user.id}`, 10)) return NextResponse.json({ ok: false }, { status: 429 })

  const admin = getAdminDb()
  const ids = [...new Set(body.userIds.filter((x) => typeof x === 'string'))].filter((x) => x !== user.id).slice(0, 25)
  const { data: caller } = await admin.from('workspace_members').select('role').eq('workspace_id', body.workspaceId).eq('user_id', user.id).maybeSingle()
  if (!caller || caller.role === 'viewer') return NextResponse.json({ ok: false }, { status: 403 })
  const { data: members } = await admin.from('workspace_members').select('user_id, profile:profiles!workspace_members_user_id_fkey(email, full_name)').eq('workspace_id', body.workspaceId).in('user_id', ids)
  const { data: ws } = await admin.from('workspaces').select('name').eq('id', body.workspaceId).maybeSingle()
  const { data: me } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const link = `${base}${safePath(body.url)}`
  const subject = String(body.subject).slice(0, 150)
  const lines = [String(body.text ?? '').slice(0, 500), body.when ? String(body.when).slice(0, 80) : ''].filter(Boolean)
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto"><p style="color:#666;font-size:13px">${esc(me?.full_name ?? '')} · ${esc(ws?.name ?? '')}</p><h2 style="margin:4px 0 12px">${esc(subject)}</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<p><a href="${esc(link)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir</a></p></div>`

  let sent = 0
  for (const m of (members ?? []) as unknown as { profile: { email?: string } | null }[]) {
    const to = m.profile?.email
    if (!to || to.endsWith('.invalid')) continue
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM ?? 'Flow <onboarding@resend.dev>', to, subject, html, text: `${lines.join('\n')}\n${link}` }) }).catch(() => null)
    if (r?.ok) sent++
  }
  return NextResponse.json({ ok: true, sent })
}
