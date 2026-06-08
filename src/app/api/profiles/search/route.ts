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
    const q = searchParams.get('q')?.trim() ?? ''
    const workspaceId = searchParams.get('workspaceId') ?? ''

    if (q.length < 2) return NextResponse.json([])

    // Auth check
    const supa = await createServerClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()

    // Search all profiles by email OR name — admin bypasses RLS
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, avatar_url, email')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10)

    if (!profiles?.length) return NextResponse.json([])

    // Exclude current members of the workspace
    if (workspaceId) {
      const { data: existing } = await admin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
      const memberIds = new Set((existing ?? []).map((m) => m.user_id))
      // Also exclude self
      memberIds.add(user.id)
      return NextResponse.json(profiles.filter((p) => !memberIds.has(p.id)))
    }

    return NextResponse.json(profiles.filter((p) => p.id !== user.id))
  } catch (err) {
    console.error('[profiles/search]', err)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
