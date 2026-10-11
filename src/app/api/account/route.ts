import { NextResponse } from 'next/server'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

/** Permanently deletes the signed-in user's account (after typing their e-mail). Refuses while they own a shared workspace. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req) || !(req.headers.get('content-type') ?? '').startsWith('application/json')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (rateLimited(`account:${user.id}`, 5, 10 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: { email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  if (!user.email || body.email?.trim().toLowerCase() !== user.email.toLowerCase()) return NextResponse.json({ error: 'confirmation_mismatch' }, { status: 400 })

  const a = getAdminDb()
  const { data: owned } = await a.from('workspaces').select('id').eq('owner_id', user.id)
  for (const w of owned ?? []) {
    // Other humans (bots do not count) would lose their workspace: the owner must delete it or hand it over first.
    const { data: ms } = await a.from('workspace_members').select('user_id,profile:profiles(preferences)').eq('workspace_id', w.id).neq('user_id', user.id)
    if ((ms ?? []).some((m) => !((m.profile as { preferences?: { bot?: boolean } } | null)?.preferences?.bot))) return NextResponse.json({ error: 'owns_shared_workspace' }, { status: 409 })
  }
  const { error } = await a.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
