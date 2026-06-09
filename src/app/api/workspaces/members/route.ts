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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

    const supa = await createServerClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()

    // Verify caller is in this workspace (or is the workspace owner)
    const { data: workspace } = await admin
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single()

    const { data: callerMember } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!callerMember && workspace?.owner_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Fetch all members + profiles (admin bypasses RLS)
    const { data: members, error } = await admin
      .from('workspace_members')
      .select('id, user_id, role, joined_at')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true })

    if (error) throw error

    if (!members?.length) return NextResponse.json([])

    // Batch fetch profiles
    const userIds = members.map((m) => m.user_id)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, avatar_url, email')
      .in('id', userIds)

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

    const enriched = members.map((m) => ({
      ...m,
      profile: profileMap.get(m.user_id) ?? null,
    }))

    return NextResponse.json(enriched)
  } catch (err) {
    console.error('[workspace/members]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
