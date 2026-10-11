'use client'
 
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getDb } from '@/lib/supabase/client'
import { readCache, writeCache } from '@/lib/offline'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { useSession } from './use-session'
import { useLive } from './use-live'
import type { Member, Profile, Project, Role, Workspace } from '@/lib/types'

type WsCtx = {
  ws: Workspace
  members: (Member & { profile: Profile | null })[]
  projects: Project[]
  me: Profile | null
  /** User ids currently connected to this workspace (live presence). */
  online: Set<string>
  role: Role
  canWrite: boolean
  isAdmin: boolean
  profileOf: (id?: string | null) => Profile | null
  nameOf: (id?: string | null) => string
  log: (action: string, entityType: string, entityId: string | null, meta?: Record<string, unknown>) => void
  notifyUser: (userId: string, n: { type: string; title: string; body?: string; url?: string }) => Promise<void>
  refreshProjects: () => Promise<void>
  refreshMembers: () => Promise<void>
}
const Ctx = createContext<WsCtx | null>(null)

export function WorkspaceProvider({ slug, children, fallback, notFound }: { slug: string; children: ReactNode; fallback: ReactNode; notFound: ReactNode }) {
  const { userId, profile } = useSession()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  useEffect(() => {
    if (!userId) return
    let alive = true
    setState('loading')
    getDb().from('workspaces').select('*').eq('slug', slug).maybeSingle().then(({ data, error }) => {
      if (!alive) return
      if (data) { setWs(data as Workspace); setState('ok'); if (!isDemoBrowser()) { writeCache(`ws:${slug}`, data); try { localStorage.setItem('flow_last_ws', slug) } catch {} } }
      else if (error) { const c = readCache<Workspace>(`ws:${slug}`); if (c) { setWs(c); setState('ok') } else setState('missing') }
      else setState('missing')
    })
    return () => { alive = false }
  }, [slug, userId])

  if (state === 'loading' || !ws) return state === 'missing' ? <>{notFound}</> : <>{fallback}</>
  return <Inner ws={ws} me={profile} userId={userId!}>{children}</Inner>
}

function Inner({ ws, me, userId, children }: { ws: Workspace; me: Profile | null; userId: string; children: ReactNode }) {
  const membersQ = useLive<any>('workspace_members', { select: '*, profile:profiles!workspace_members_user_id_fkey(*)', eq: { workspace_id: ws.id }, order: ['joined_at', true] })
  const projectsQ = useLive<Project>('projects', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', true] })

  const [online, setOnline] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const db = getDb()
    const ch = db.channel(`presence:ws:${ws.id}`, { config: { presence: { key: userId } } })
    const sync = () => setOnline(new Set(Object.keys(ch.presenceState())))
    ch.on('presence', { event: 'sync' }, sync).subscribe((st: string) => { if (st === 'SUBSCRIBED') void ch.track({ at: Date.now() }) })
    return () => { void db.removeChannel(ch) }
  }, [ws.id, userId])

  const members = membersQ.data as (Member & { profile: Profile | null })[]
  const myMember = members.find((m) => m.user_id === userId)
  const role: Role = myMember?.role ?? 'viewer'

  const profileOf = useCallback((id?: string | null) => (id ? members.find((m) => m.user_id === id)?.profile ?? null : null), [members])
  const nameOf = useCallback((id?: string | null) => profileOf(id)?.full_name ?? profileOf(id)?.email ?? '—', [profileOf])

  const log = useCallback((action: string, entityType: string, entityId: string | null, meta: Record<string, unknown> = {}) => {
    void getDb().from('activity_logs').insert({ workspace_id: ws.id, user_id: userId, action, entity_type: entityType, entity_id: entityId, meta })
  }, [ws.id, userId])

  const notifyUser = useCallback(async (target: string, n: { type: string; title: string; body?: string; url?: string }) => {
    if (target === userId) return
    await getDb().from('notifications').insert({ user_id: target, workspace_id: ws.id, type: n.type, title: n.title, body: n.body ?? null, url: n.url ?? null })
    // Offline devices get a Web Push (no-op in demo mode / when VAPID isn't configured).
    if (!isDemoBrowser()) void fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: target, workspaceId: ws.id, type: n.type, title: n.title, body: n.body, url: n.url }) }).catch(() => {})
  }, [ws.id, userId])

  const value = useMemo<WsCtx>(() => ({
    ws, members, projects: projectsQ.data, me, online, role, canWrite: role !== 'viewer', isAdmin: role === 'owner' || role === 'admin',
    profileOf, nameOf, log, notifyUser, refreshProjects: projectsQ.refresh, refreshMembers: membersQ.refresh,
  }), [ws, members, projectsQ.data, projectsQ.refresh, membersQ.refresh, me, online, role, profileOf, nameOf, log, notifyUser])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useWorkspace outside <WorkspaceProvider>')
  return c
}
