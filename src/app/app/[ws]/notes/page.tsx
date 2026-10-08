'use client'
import { NotesList } from '@/components/notes/notes-list'
export default function Page() { return <NotesList kinds={['note', 'doc', 'wiki']} title="notes.title" newLabel="notes.new" icon="note" /> }
