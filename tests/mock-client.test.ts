import { describe, expect, it } from 'vitest'
import { createMockClient } from '@/lib/demo/mock-client'
import { createSeed } from '@/lib/demo/seed'
import { DEMO_USER_ID } from '@/lib/demo/constants'

const make = () => createMockClient(createSeed(), { user: { id: DEMO_USER_ID } }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

describe('demo mock client', () => {
  it('authenticates the demo user', async () => {
    const db = make()
    const { data } = await db.auth.getSession()
    expect(data.session.user.id).toBe(DEMO_USER_ID)
  })

  it('filters, orders and limits', async () => {
    const db = make()
    const { data } = await db.from('tasks').select('id,title,priority').eq('status', 'todo').is('deleted_at', null).order('position', { ascending: true }).limit(3)
    expect(data).toHaveLength(3)
    expect(Object.keys(data[0]).sort()).toEqual(['id', 'priority', 'title'])
  })

  it('resolves embedded relations (to-one and to-many)', async () => {
    const db = make()
    const { data: members } = await db.from('workspace_members').select('*, profile:profiles(*)').limit(1)
    expect(members[0].profile.email).toBeTruthy()
    const { data: goals } = await db.from('goals').select('*, key_results(*)')
    expect(goals.some((g: { key_results: unknown[] }) => g.key_results.length > 0)).toBe(true)
  })

  it('insert → update → delete round trip', async () => {
    const db = make()
    const ws = (await db.from('workspaces').select('id').limit(1).single()).data.id
    const { data: row } = await db.from('tasks').insert({ workspace_id: ws, title: 'Test' }).select().single()
    expect(row.status).toBe('todo')
    await db.from('tasks').update({ status: 'done' }).eq('id', row.id)
    expect((await db.from('tasks').select('status').eq('id', row.id).single()).data.status).toBe('done')
    await db.from('tasks').delete().eq('id', row.id)
    expect((await db.from('tasks').select('id').eq('id', row.id).maybeSingle()).data).toBeNull()
  })

  it('single() errors on zero rows and maybeSingle() does not', async () => {
    const db = make()
    expect((await db.from('tasks').select('*').eq('id', 'nope').single()).error).toBeTruthy()
    expect((await db.from('tasks').select('*').eq('id', 'nope').maybeSingle()).error).toBeNull()
  })

  it('create_workspace RPC adds owner + #general', async () => {
    const db = make()
    const { data: ws } = await db.rpc('create_workspace', { p_name: 'X', p_slug: 'x-1' }).single()
    const members = await db.from('workspace_members').select('role').eq('workspace_id', ws.id)
    expect(members.data[0].role).toBe('owner')
    const conv = await db.from('conversations').select('name').eq('workspace_id', ws.id)
    expect(conv.data[0].name).toBe('general')
  })

  it('open_dm is idempotent', async () => {
    const db = make()
    const ws = (await db.from('workspaces').select('id').limit(1).single()).data.id
    const other = (await db.from('profiles').select('id').neq('id', DEMO_USER_ID).limit(1).single()).data.id
    const a = (await db.rpc('open_dm', { p_workspace: ws, p_other: other }).single()).data
    const b = (await db.rpc('open_dm', { p_workspace: ws, p_other: other }).single()).data
    expect(a).toBe(b)
  })

  it('delivers realtime INSERT events to matching subscribers only', async () => {
    const db = make()
    const ws = (await db.from('workspaces').select('id').limit(1).single()).data.id
    const got: string[] = []
    db.channel('t').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${ws}` }, (p: { new: { title: string } }) => got.push(p.new.title)).subscribe()
    await db.from('tasks').insert({ workspace_id: ws, title: 'live' })
    await db.from('tasks').insert({ workspace_id: 'other', title: 'ignored' })
    await new Promise((r) => setTimeout(r, 20))
    expect(got).toEqual(['live'])
  })
})
