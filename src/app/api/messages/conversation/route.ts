import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** POST /api/messages/conversation
 * body: { type: 'channel'|'dm', workspaceId, name?, isPrivate?, memberIds? }
 * Returns the created conversation row.
 */
export async function POST(request: Request) {
  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json()
  const { type, workspaceId, name, isPrivate, memberIds } = body

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  const admin = getAdmin()

  // Verify caller is workspace member
  const { data: member } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  if (type === 'channel') {
    if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 })

    // Check duplicate channel name in workspace
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', 'channel')
      .eq('name', name)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Canal déjà existant', existing }, { status: 409 })

    const { data: conv, error } = await admin
      .from('conversations')
      .insert({ workspace_id: workspaceId, type: 'channel', name, is_private: isPrivate ?? false, created_by: user.id })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Add creator as member
    await admin.from('conversation_members').insert({
      conversation_id: conv.id,
      user_id: user.id,
    })

    return NextResponse.json(conv)
  }

  if (type === 'dm') {
    const ids: string[] = memberIds ?? []
    if (!ids.includes(user.id)) ids.unshift(user.id)
    if (ids.length < 2) return NextResponse.json({ error: 'Au moins 2 membres requis' }, { status: 400 })

    const dmType = ids.length === 2 ? 'dm' : 'group_dm'

    // Check for existing DM between exact same users
    const { data: existingConvs } = await admin
      .from('conversations')
      .select('id, members:conversation_members(user_id)')
      .eq('workspace_id', workspaceId)
      .eq('type', dmType)

    type ConvWithMembers = { id: string; members: { user_id: string }[] }
    const found = (existingConvs as unknown as ConvWithMembers[] ?? []).find(c => {
      const convUserIds = c.members.map(m => m.user_id).sort()
      const targetIds = [...ids].sort()
      return convUserIds.length === targetIds.length &&
        convUserIds.every((id, i) => id === targetIds[i])
    })

    if (found) return NextResponse.json({ ...found, existing: true })

    const { data: conv, error } = await admin
      .from('conversations')
      .insert({ workspace_id: workspaceId, type: dmType, created_by: user.id })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await admin.from('conversation_members').insert(
      ids.map(uid => ({ conversation_id: conv.id, user_id: uid }))
    )

    return NextResponse.json(conv)
  }

  return NextResponse.json({ error: 'type invalide' }, { status: 400 })
}
