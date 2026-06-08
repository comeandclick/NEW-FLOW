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

// Repairs workspaces where owner exists but is missing from workspace_members
export async function POST(request: Request) {
  try {
    const { workspaceId } = await request.json().catch(() => ({}))
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

    const supa = await createServerClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()

    // Verify caller is the workspace owner
    const { data: workspace } = await admin
      .from('workspaces')
      .select('id, name, slug, owner_id')
      .eq('id', workspaceId)
      .single()

    if (!workspace || workspace.owner_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Check if already a member
    const { data: existing } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ repaired: false, message: 'Déjà membre' })
    }

    // Insert owner membership
    const { error } = await admin
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' })

    if (error) throw error

    // Ensure #general channel exists and user is in it
    const { data: general } = await admin
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', 'general')
      .eq('type', 'channel')
      .single()

    if (general) {
      await admin
        .from('conversation_members')
        .upsert({ conversation_id: general.id, user_id: user.id, role: 'owner' })
    } else {
      const { data: newChan } = await admin
        .from('conversations')
        .insert({ workspace_id: workspaceId, type: 'channel', name: 'general', created_by: user.id })
        .select()
        .single()
      if (newChan) {
        await admin.from('conversation_members').insert({
          conversation_id: newChan.id, user_id: user.id, role: 'owner',
        })
      }
    }

    return NextResponse.json({ repaired: true })
  } catch (err) {
    console.error('[repair-owner]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
