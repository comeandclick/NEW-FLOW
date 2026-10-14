'use client'
// Dossier privé d'un client (14/10/2026) : description détaillée du projet (champ clients.notes, jamais envoyé au portail)
// et notes internes (table notes, étiquetées client:<id>). Lu par l'équipe, l'assistant et les agents IA ; le client ne le voit pas.
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clapperboard, Lightbulb, Lock, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { getDb } from '@/lib/supabase/client'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { NOTE_GENRES, noteClientTags, texteDeNote, type NoteGenre } from '@/lib/client-notes'
import type { ClientRow } from '@/lib/clients'
import type { Note } from '@/lib/types'
import { cn } from '@/lib/utils'

const ICONES: Record<NoteGenre, typeof StickyNote> = { note: StickyNote, idee_video: Lightbulb, modele_motion: Clapperboard }

export function DossierPrive({ client, onSaved }: { client: ClientRow; onSaved: () => void }) {
  const { ws, canWrite, nameOf } = useWorkspace(); const { userId } = useSession()
  const notes = useLive<Note>('notes', { select: 'id,title,content,tags,created_by,created_at,updated_at', eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false], limit: 200 })
  const miennes = notes.data.filter((n) => (n.tags ?? []).includes(`client:${client.id}`))
  const [edition, setEdition] = useState(false)
  const [desc, setDesc] = useState(client.notes ?? '')
  const [ajout, setAjout] = useState(false)
  const [genre, setGenre] = useState<NoteGenre>('note')
  const [titre, setTitre] = useState('')
  const [texte, setTexte] = useState('')

  async function enregistrerDesc() {
    const { error } = await getDb().from('clients').update({ notes: desc.trim() || null, updated_at: new Date().toISOString() }).eq('id', client.id)
    if (error) { toast.error('Enregistrement impossible'); return }
    setEdition(false); onSaved(); toast.success('Description enregistrée')
  }
  async function ajouter() {
    if (!titre.trim() || !userId) return
    const { error } = await getDb().from('notes').insert({ workspace_id: ws.id, created_by: userId, kind: 'note', title: `${client.name} · ${titre.trim()}`, tags: noteClientTags(client.id, genre),
      content: { type: 'doc', content: texte.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) } })
    if (error) { toast.error('Enregistrement impossible'); return }
    setTitre(''); setTexte(''); setAjout(false); void notes.refresh()
  }
  async function supprimer(n: Note) {
    notes.setData((d) => d.filter((x) => x.id !== n.id))
    await getDb().from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', n.id)
  }

  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Lock className="size-3.5 text-text-3" /><h2 className="text-[13px] font-semibold">Dossier privé</h2>
        <span className="text-xs text-text-3">toi, ton équipe et les IA · le client ne le voit jamais</span>
      </div>
      <div className="grid gap-px bg-border md:grid-cols-[1.2fr_1fr]">
        <div className="bg-surface p-4">
          <div className="mb-2 flex items-center gap-2"><span className="text-[12px] font-medium text-text-3">Description du projet</span>
            {canWrite && !edition && <button onClick={() => { setDesc(client.notes ?? ''); setEdition(true) }} className="ml-auto inline-flex items-center gap-1 text-xs text-text-3 hover:text-text"><Pencil className="size-3" />Modifier</button>}</div>
          {edition ? (
            <div className="space-y-2">
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-48 text-[13px]" placeholder="Le projet en détail : produit, public, ton, couleurs, ce qu'il veut, ce qui est prévu, ce qu'on attend de lui…" autoFocus />
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEdition(false)}>Annuler</Button><Button size="sm" variant="primary" onClick={() => void enregistrerDesc()}>Enregistrer</Button></div>
            </div>
          ) : client.notes ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-2">{client.notes}</p>
            : <p className="text-[13px] text-text-3">Pas encore de description. Décris le projet : l&apos;assistant et les agents IA s&apos;en servent pour imaginer les vidéos.</p>}
        </div>
        <div className="bg-surface p-4">
          <div className="mb-2 flex items-center gap-2"><span className="text-[12px] font-medium text-text-3">Notes internes</span><span className="text-xs text-text-3">{miennes.length}</span>
            {canWrite && <button onClick={() => setAjout((a) => !a)} className="ml-auto inline-flex items-center gap-1 text-xs text-text-3 hover:text-text"><Plus className="size-3" />Ajouter</button>}</div>
          {ajout && (
            <div className="mb-3 space-y-2 rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap gap-1.5">{(Object.keys(NOTE_GENRES) as NoteGenre[]).map((g) => <button key={g} type="button" onClick={() => setGenre(g)} className={cn('rounded-full border px-2.5 py-1 text-xs', genre === g ? 'border-transparent bg-text text-bg' : 'border-border text-text-2')}>{NOTE_GENRES[g]}</button>)}</div>
              <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre" />
              <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} className="min-h-20 text-[13px]" placeholder="Détails" />
              <div className="flex justify-end"><Button size="sm" variant="primary" disabled={!titre.trim()} onClick={() => void ajouter()}>Ajouter</Button></div>
            </div>
          )}
          {!miennes.length && !ajout ? <p className="text-[13px] text-text-3">Aucune note interne.</p> : (
            <ul className="space-y-1.5">{miennes.map((n) => { const g = (Object.keys(NOTE_GENRES) as NoteGenre[]).find((k) => n.tags.includes(k.replace('_', '-'))) ?? 'note', I = ICONES[g]
              return (
                <li key={n.id} className="group rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2"><I className="size-3.5 shrink-0 text-text-3" />
                    <Link href={`/app/${ws.slug}/notes/${n.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:underline">{n.title.replace(`${client.name} · `, '')}</Link>
                    <span className="shrink-0 text-[11px] text-text-3">{NOTE_GENRES[g]} · {format(new Date(n.created_at), 'd MMM', { locale: fr })}</span>
                    {canWrite && <button onClick={() => void supprimer(n)} aria-label="Supprimer" className="opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="size-3.5 text-text-3 hover:text-danger" /></button>}
                  </div>
                  {texteDeNote(n.content) && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-text-2">{texteDeNote(n.content)}</p>}
                  <p className="mt-1 text-[11px] text-text-3">{nameOf(n.created_by)}</p>
                </li>) })}</ul>
          )}
        </div>
      </div>
    </section>
  )
}
