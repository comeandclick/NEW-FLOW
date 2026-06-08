import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { name } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }

    // Auth client — get current user
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    const userId = session.user.id

    // Admin client — bypass RLS for cross-table inserts
    const admin = await createAdminClient()

    const slug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Math.random().toString(36).substring(2, 7)

    // 1. Create workspace
    const { data: workspace, error: wsError } = await admin
      .from('workspaces')
      .insert({ name: name.trim(), slug, owner_id: userId })
      .select()
      .single()
    if (wsError) throw wsError

    // 2. Add creator as owner member (admin = no RLS block)
    const { error: memberError } = await admin
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: userId, role: 'owner' })
    if (memberError) throw memberError

    // 3. Auto-create #general channel
    const { data: channel } = await admin
      .from('conversations')
      .insert({
        workspace_id: workspace.id,
        type: 'channel',
        name: 'general',
        created_by: userId,
      })
      .select()
      .single()

    if (channel) {
      await admin.from('conversation_members').insert({
        conversation_id: channel.id,
        user_id: userId,
        role: 'owner',
      })
    }

    return NextResponse.json({ workspace })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    console.error('[workspace/create]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
