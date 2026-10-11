import { NextResponse } from 'next/server'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'
import { readTagMeta } from '@/lib/note-tags'

export const runtime = 'nodejs'

/**
 * Saves note-tag colours and notified people for a workspace.
 * Any member who can write may do it (workspace settings themselves stay admin-only), so it goes through here.
 * Only `settings.note_tags` is replaced; the rest of the settings (API keys, alert routes…) is left untouched.
 */
export async function POST(req: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 501 })
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  let body: { workspaceId?: string; meta?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!body.workspaceId || typeof body.workspaceId !== 'string') return NextResponse.json({ ok: false }, { status: 400 })

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (rateLimited(`tags:${user.id}`, 30)) return NextResponse.json({ ok: false }, { status: 429 })

  const admin = getAdminDb()
  const { data: me } = await admin.from('workspace_members').select('role').eq('workspace_id', body.workspaceId).eq('user_id', user.id).maybeSingle()
  if (!me || me.role === 'viewer') return NextResponse.json({ ok: false }, { status: 403 })

  const { data: members } = await admin.from('workspace_members').select('user_id').eq('workspace_id', body.workspaceId)
  const ids = new Set((members ?? []).map((m) => m.user_id as string))
  const parsed = readTagMeta({ note_tags: body.meta })
  const meta = Object.fromEntries(Object.entries(parsed).slice(0, 200).map(([k, v]) => [k, { ...v, users: (v.users ?? []).filter((u) => ids.has(u)) }]))

  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', body.workspaceId).single()
  const settings = { ...((ws?.settings as object | null) ?? {}), note_tags: meta }
  const { error } = await admin.from('workspaces').update({ settings }).eq('id', body.workspaceId)
  if (error) return NextResponse.json({ ok: false }, { status: 500 })
  return NextResponse.json({ ok: true, meta })
}
