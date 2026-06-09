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

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(',')),
  ]
  return lines.join('\n')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  const type = searchParams.get('type') ?? 'tasks' // tasks | notes | members

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = getAdmin()

  // Verify membership
  const { data: member } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  let csv = ''
  let filename = `export-${type}.csv`

  if (type === 'tasks') {
    const { data } = await admin
      .from('tasks')
      .select('id, title, status, priority, due_date, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    csv = toCsv((data ?? []) as Record<string, unknown>[])
    filename = 'taches.csv'
  } else if (type === 'notes') {
    const { data } = await admin
      .from('notes')
      .select('id, title, is_pinned, is_archived, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    csv = toCsv((data ?? []) as Record<string, unknown>[])
    filename = 'notes.csv'
  } else if (type === 'members') {
    const { data: members } = await admin
      .from('workspace_members')
      .select('user_id, role, joined_at')
      .eq('workspace_id', workspaceId)
    const userIds = (members ?? []).map(m => m.user_id)
    const { data: profiles } = await admin.from('profiles').select('id, full_name, email').in('id', userIds)
    const pm = new Map((profiles ?? []).map(p => [p.id, p]))
    const rows = (members ?? []).map(m => ({
      email: pm.get(m.user_id)?.email ?? '',
      full_name: pm.get(m.user_id)?.full_name ?? '',
      role: m.role,
      joined_at: m.joined_at,
    }))
    csv = toCsv(rows)
    filename = 'membres.csv'
  } else if (type === 'crm_contacts') {
    const { data } = await admin
      .from('crm_contacts')
      .select('name, email, phone, company, position, status, created_at')
      .eq('workspace_id', workspaceId)
    csv = toCsv((data ?? []) as Record<string, unknown>[])
    filename = 'contacts-crm.csv'
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
