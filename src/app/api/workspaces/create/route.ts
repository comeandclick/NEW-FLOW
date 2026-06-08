import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service-role admin client — bypasses RLS entirely
function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = body?.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }

    // Verify caller is authenticated
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    const userId = user.id

    const admin = getAdminClient()

    // Build slug
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Math.random().toString(36).substring(2, 7)

    // 1. Create workspace
    const { data: workspace, error: wsError } = await admin
      .from('workspaces')
      .insert({ name, slug, owner_id: userId })
      .select()
      .single()
    if (wsError) throw new Error(`workspace: ${wsError.message}`)

    // 2. Add creator as owner member
    const { error: memberError } = await admin
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: userId, role: 'owner' })
    if (memberError) throw new Error(`member: ${memberError.message}`)

    // 3. Auto-create #general channel
    const { data: channel, error: chanError } = await admin
      .from('conversations')
      .insert({
        workspace_id: workspace.id,
        type: 'channel',
        name: 'general',
        created_by: userId,
      })
      .select()
      .single()

    if (!chanError && channel) {
      await admin.from('conversation_members').insert({
        conversation_id: channel.id,
        user_id: userId,
        role: 'owner',
      })
    }

    return NextResponse.json({ workspace })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[workspace/create] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
