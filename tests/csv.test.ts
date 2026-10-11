import { describe, expect, it } from 'vitest'
import { contactsToCsv, parseContactsCsv, parseCsv, parseTasksCsv, resolveAssignee, resolveProject, tasksToCsv, toDate, toPriority, toStatus } from '../src/lib/csv'

describe('csv', () => {
  it('parses quotes, newlines and French semicolon files', () => {
    expect(parseCsv('a,b\n"x, y","l1\nl2"\n')).toEqual([['a', 'b'], ['x, y', 'l1\nl2']])
    expect(parseCsv('﻿titre;statut\nA;En cours\n')).toEqual([['titre', 'statut'], ['A', 'En cours']])
  })
  it('understands French / English / Trello vocab', () => {
    expect(toStatus('En cours')).toBe('in_progress'); expect(toStatus('Done')).toBe('done'); expect(toStatus('Terminé')).toBe('done'); expect(toStatus('???')).toBe('todo')
    expect(toPriority('Haute')).toBe('high'); expect(toPriority('P0')).toBe('urgent'); expect(toPriority('')).toBe('medium')
    expect(toDate('31/12/2026')?.slice(0, 10)).toBe(new Date(2026, 11, 31, 18).toISOString().slice(0, 10)); expect(toDate('nope')).toBeNull()
  })
  it('imports a Trello-style export', () => {
    const r = parseTasksCsv('Card Name,Card Description,List Name,Due Date,Labels\nRéviser le cours,Détail,Doing,2026-10-20,"ios, urgent"\n,vide,To Do,,\n')!
    expect(r.tasks).toHaveLength(1); expect(r.skipped).toBe(1)
    expect(r.tasks[0]).toMatchObject({ title: 'Réviser le cours', status: 'in_progress', tags: ['ios', 'urgent'], description: 'Détail' })
    expect(parseTasksCsv('foo,bar\n1,2')).toBeNull()
  })
  it('round-trips tasks through export', () => {
    const ctx = { projects: [{ id: 'p1', name: 'Kalimat 2.0' }], members: [{ user_id: 'u1', email: 'a@b.co', name: 'Aymen' }] }
    const csv = tasksToCsv([{ title: 'T, avec virgule', description: 'd', status: 'done', priority: 'high', due_date: '2026-10-20T16:00:00Z', tags: ['x', 'y'], estimate_minutes: 30, project_id: 'p1', assignee_id: 'u1' }], ctx)
    const back = parseTasksCsv(csv)!.tasks[0]
    expect(back).toMatchObject({ title: 'T, avec virgule', status: 'done', priority: 'high', tags: ['x', 'y'], estimate_minutes: 30, project: 'Kalimat 2.0', assignee: 'a@b.co' })
    expect(resolveProject(back.project, ctx)).toBe('p1'); expect(resolveAssignee(back.assignee, ctx)).toBe('u1'); expect(resolveProject('autre', ctx)).toBeNull()
  })
  it('imports and exports contacts', () => {
    const r = parseContactsCsv('Nom,E-mail,Société,Statut\nLéa Martin,lea@x.fr,Acme,client\n,only@mail.com,,\n,,,\n')!
    expect(r.contacts.map((c) => [c.name, c.status])).toEqual([['Léa Martin', 'customer'], ['only', 'lead']])
    expect(parseContactsCsv(contactsToCsv(r.contacts))!.contacts[0].email).toBe('lea@x.fr')
  })
})
