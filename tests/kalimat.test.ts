import { describe, expect, it } from 'vitest'
import { createSeed } from '@/lib/demo/seed'
import { events, goals, mdToDoc, notes, tasks, files } from '@/lib/demo/kalimat-data'

describe('Kalimat workspace data', () => {
  it('is added to the demo seed as a second workspace', () => {
    const db = createSeed()
    const ws = db.workspaces.find((w) => w.slug === 'kalimat')!
    expect(ws).toBeTruthy()
    expect(db.tasks.filter((t) => t.workspace_id === ws.id)).toHaveLength(tasks.length)
    expect(db.notes.filter((t) => t.workspace_id === ws.id)).toHaveLength(notes.length)
    expect(db.goals.filter((t) => t.workspace_id === ws.id)).toHaveLength(goals.length)
    expect(db.events.filter((t) => t.workspace_id === ws.id)).toHaveLength(events.length)
    expect(db.files.filter((t) => t.workspace_id === ws.id)).toHaveLength(files.length)
  })
  it('has unique ids and no dangling project references', () => {
    const db = createSeed()
    for (const table of ['tasks', 'notes', 'events', 'goals', 'files', 'projects']) {
      const ids = db[table].map((r) => r.id)
      expect(new Set(ids).size, table).toBe(ids.length)
    }
    const projects = new Set(db.projects.map((p) => p.id))
    for (const t of db.tasks) if (t.project_id) expect(projects.has(t.project_id)).toBe(true)
  })
  it('keeps open and done tasks from the TODO', () => {
    expect(tasks.filter((t) => t.status === 'done').length).toBeGreaterThan(20)
    expect(tasks.filter((t) => t.status !== 'done').length).toBeGreaterThan(30)
  })
  it('converts markdown to a TipTap document', () => {
    const doc = mdToDoc('# Titre\n- a\n- b\n- [x] fait\n- [ ] à faire\ntexte')
    const types = doc.content.map((n) => (n as { type: string }).type)
    expect(types).toEqual(['heading', 'bulletList', 'taskList', 'paragraph'])
  })
})
