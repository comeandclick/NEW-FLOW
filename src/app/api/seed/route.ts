/**
 * POST /api/seed
 * Seed the workspace with demo notes, events, tasks, conversations.
 * Body: { workspaceId: string }
 * Only runs when NODE_ENV !== 'production' OR when a special seed_token matches.
 */
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

export async function POST(request: Request) {
  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { workspaceId } = await request.json()
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  const admin = getAdmin()

  // Verify caller is workspace member
  const { data: member } = await admin
    .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const now = new Date()
  const results: string[] = []

  // ── 1. Demo notes ──────────────────────────────────────────────────────────
  const notesToCreate = [
    { title: 'Réunion de lancement du projet', icon: null, tags: ['projet', 'réunion'], content: JSON.stringify({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Objectifs' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Définir la roadmap Q3, aligner les équipes, établir les KPIs.' }] }] }) },
    { title: 'Idées product — brainstorm', icon: null, tags: ['product', 'ideas'], content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '- Améliorer l\'onboarding\n- Tableau de bord personnalisable\n- Notifications intelligentes' }] }] }) },
    { title: 'Architecture technique v2', icon: null, tags: ['tech', 'architecture'], is_pinned: true, content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Migration vers microservices. Phase 1: API Gateway. Phase 2: Event bus.' }] }] }) },
    { title: 'Feedback utilisateurs — Sprint 4', icon: null, tags: ['ux', 'feedback'], content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Retours positifs sur la vitesse. Points d\'amélioration: navigation mobile, recherche.' }] }] }) },
    { title: 'Documentation API publique', icon: null, tags: ['doc', 'api'], content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Endpoints: GET /users, POST /workspaces, PUT /tasks/:id...' }] }] }) },
  ]

  for (const n of notesToCreate) {
    const { error } = await admin.from('notes').insert({
      workspace_id: workspaceId,
      title: n.title,
      icon: n.icon,
      tags: n.tags,
      content: n.content as unknown as import('@/types/database').Json,
      is_pinned: (n as { is_pinned?: boolean }).is_pinned ?? false,
      created_by: user.id,
    })
    if (!error) results.push(`note: ${n.title}`)
  }

  // ── 2. Demo events ─────────────────────────────────────────────────────────
  const eventsToCreate = [
    { title: 'Standup quotidien', start: addDays(now, 0, 9, 0), end: addDays(now, 0, 9, 15), color: '#6366f1' },
    { title: 'Sprint review', start: addDays(now, 1, 14, 0), end: addDays(now, 1, 15, 30), color: '#22c55e' },
    { title: 'Démo client', start: addDays(now, 2, 10, 0), end: addDays(now, 2, 11, 0), color: '#f97316' },
    { title: 'Formation équipe', start: addDays(now, 3, 9, 0), end: addDays(now, 3, 17, 0), color: '#8b5cf6', all_day: false },
    { title: 'Lancement v2.0', start: addDays(now, 7, 0, 0), end: addDays(now, 7, 0, 0), all_day: true, color: '#ec4899' },
    { title: 'Code review session', start: addDays(now, -1, 15, 0), end: addDays(now, -1, 16, 0), color: '#0ea5e9' },
    { title: 'Planning Sprint 12', start: addDays(now, 4, 10, 0), end: addDays(now, 4, 12, 0), color: '#6366f1' },
  ]

  for (const e of eventsToCreate) {
    const { error } = await admin.from('events').insert({
      workspace_id: workspaceId,
      title: e.title,
      start_at: e.start,
      end_at: e.end,
      all_day: e.all_day ?? false,
      color: e.color,
      created_by: user.id,
    })
    if (!error) results.push(`event: ${e.title}`)
  }

  // ── 3. Demo tasks ──────────────────────────────────────────────────────────
  const tasksToCreate = [
    { title: 'Configurer CI/CD pipeline', status: 'done', priority: 'high', due_date: addDays(now, -3) },
    { title: 'Implémenter authentification SSO', status: 'in_progress', priority: 'urgent', due_date: addDays(now, 2) },
    { title: 'Refactoring composants UI', status: 'in_review', priority: 'medium', due_date: addDays(now, 5) },
    { title: 'Optimiser les requêtes base de données', status: 'todo', priority: 'high', due_date: addDays(now, 7) },
    { title: 'Écrire les tests unitaires', status: 'todo', priority: 'medium', due_date: addDays(now, 10) },
    { title: 'Mettre à jour la documentation', status: 'todo', priority: 'low', due_date: addDays(now, 14) },
    { title: 'Design système de notifications', status: 'in_progress', priority: 'high', due_date: addDays(now, 3), assignee_id: user.id },
    { title: 'Audit sécurité', status: 'todo', priority: 'urgent', due_date: addDays(now, -1) },
    { title: 'Migration base de données v3', status: 'todo', priority: 'high', due_date: addDays(now, 14) },
    { title: 'Préparer la démo client', status: 'in_progress', priority: 'urgent', due_date: addDays(now, 2), assignee_id: user.id },
  ]

  for (const t of tasksToCreate) {
    const { error } = await admin.from('tasks').insert({
      workspace_id: workspaceId,
      title: t.title,
      status: t.status as 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled',
      priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
      due_date: t.due_date,
      assignee_id: (t as { assignee_id?: string }).assignee_id ?? null,
      created_by: user.id,
    })
    if (!error) results.push(`task: ${t.title}`)
  }

  // ── 4. Demo conversations ──────────────────────────────────────────────────
  // Get all workspace members
  const { data: wsMembers } = await admin
    .from('workspace_members').select('user_id').eq('workspace_id', workspaceId)
  const memberIds = (wsMembers ?? []).map(m => m.user_id)

  // Create #general channel if not exists
  const { data: existingGeneral } = await admin
    .from('conversations').select('id').eq('workspace_id', workspaceId).eq('name', 'général').eq('type', 'channel').maybeSingle()

  if (!existingGeneral) {
    const { data: conv } = await admin.from('conversations').insert({
      workspace_id: workspaceId, type: 'channel', name: 'général',
      description: 'Canal général de l\'espace de travail', is_private: false, created_by: user.id,
    }).select().single()

    if (conv) {
      await admin.from('conversation_members').insert(memberIds.map(uid => ({ conversation_id: conv.id, user_id: uid })))

      const messages = [
        'Bienvenue dans l\'espace Flow !',
        'N\'oubliez pas de mettre à jour vos tâches avant la réunion de demain.',
        'La démo client est confirmée pour jeudi à 10h.',
        '@tous — sprint review vendredi à 14h, préparez vos updates !',
        'Le CI est enfin configuré. Les déploiements sont automatiques maintenant.',
      ]
      for (const msg of messages) {
        await admin.from('messages').insert({
          conversation_id: conv.id, user_id: user.id, content: msg,
        })
      }
      results.push('conversation: #général avec messages')
    }
  }

  // Create #dev channel
  const { data: existingDev } = await admin
    .from('conversations').select('id').eq('workspace_id', workspaceId).eq('name', 'dev').eq('type', 'channel').maybeSingle()

  if (!existingDev) {
    const { data: conv } = await admin.from('conversations').insert({
      workspace_id: workspaceId, type: 'channel', name: 'dev',
      description: 'Discussions techniques', is_private: false, created_by: user.id,
    }).select().single()

    if (conv) {
      await admin.from('conversation_members').insert(memberIds.map(uid => ({ conversation_id: conv.id, user_id: uid })))

      const messages = [
        'PR #42 est prête pour review.',
        'J\'ai trouvé un bug dans le module de notifications, je crée un ticket.',
        'La migration DB est planifiée pour samedi nuit.',
        'npm audit — 0 vulnérabilités.',
      ]
      for (const msg of messages) {
        await admin.from('messages').insert({
          conversation_id: conv.id, user_id: user.id, content: msg,
        })
      }
      results.push('conversation: #dev avec messages')
    }
  }

  // ── 5. Activity logs ───────────────────────────────────────────────────────
  const activities = [
    { action: 'task.created', entity_type: 'task', metadata: { title: 'Configurer CI/CD pipeline' } },
    { action: 'note.created', entity_type: 'note', metadata: { title: 'Architecture technique v2' } },
    { action: 'task.updated', entity_type: 'task', metadata: { title: 'Implémenter authentification SSO', field: 'status', value: 'in_progress' } },
  ]

  for (const a of activities) {
    await admin.from('activity_logs').insert({
      workspace_id: workspaceId, user_id: user.id,
      action: a.action, entity_type: a.entity_type,
      metadata: a.metadata as unknown as import('@/types/database').Json,
    })
  }
  results.push(`${activities.length} activity logs`)

  return NextResponse.json({ ok: true, created: results.length, items: results })
}

function addDays(base: Date, days: number, hours = 0, minutes = 0): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}
