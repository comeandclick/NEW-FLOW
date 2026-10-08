'use client'
import { NotesList } from '@/components/notes/notes-list'
export default function Page() { return <NotesList kinds={['doc', 'wiki']} title="docs.title" newLabel="docs.new" icon="doc" /> }
