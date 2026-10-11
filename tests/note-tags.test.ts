import { describe, expect, it } from 'vitest'
import { assigneesOf, cleanTagName, readTagMeta, renameInTags, renameTag, visibleTags, withAssignees } from '@/lib/note-tags'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

describe('assignees stored in tags', () => {
  it('separates tags from assignees', () => {
    const tags = ['urgent', `for:${U1}`, 'idée', `for:${U2}`]
    expect(visibleTags(tags)).toEqual(['urgent', 'idée'])
    expect(assigneesOf(tags)).toEqual([U1, U2])
  })
  it('replaces assignees without touching tags', () => {
    expect(withAssignees(['a', `for:${U1}`], [U2, U2])).toEqual(['a', `for:${U2}`])
    expect(withAssignees(['a', `for:${U1}`], [])).toEqual(['a'])
  })
})

describe('tag metadata', () => {
  it('ignores malformed values', () => {
    expect(readTagMeta(undefined)).toEqual({})
    expect(readTagMeta({ note_tags: [] })).toEqual({})
    const m = readTagMeta({ note_tags: { ' Urgent ': { color: '#ff0000', users: [U1, 'nope', U1] }, bad: { color: 'red' }, 'for:x': {} } })
    expect(m).toEqual({ urgent: { color: '#ff0000', users: [U1] }, bad: { users: [] } })
  })
  it('renames while keeping metadata, refuses duplicates', () => {
    const m = { a: { color: '#111111', users: [U1] }, b: { users: [] } }
    expect(renameTag(m, 'a', ' C ')).toEqual({ b: { users: [] }, c: { color: '#111111', users: [U1] } })
    expect(renameTag(m, 'a', 'b')).toBeNull()
    expect(renameTag(m, 'a', '  ')).toBeNull()
    expect(renameInTags(['a', 'x', 'c'], 'a', 'c')).toEqual(['c', 'x'])
    expect(cleanTagName('  Hello   World ')).toBe('hello world')
  })
})
