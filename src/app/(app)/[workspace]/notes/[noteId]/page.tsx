'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { notesService } from '@/services/notes.service'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Pin, Archive, MoreHorizontal, Tag, X, Plus, Check, Share, FileText } from 'lucide-react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Note } from '@/types/database'
import type { Json } from '@/types/database'
import { FavoriteButton } from '@/components/workspace/FavoriteButton'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface Props {
  params: Promise<{ workspace: string; noteId: string }>
}

const NOTE_ICONS = ['📄', '📝', '💡', '🔖', '📌', '🧠', '🎯', '⭐', '📊', '🔒', '🌿', '🚀', '💬', '🎨', '📚']

export default function NoteDetailPage({ params }: Props) {
  const { workspace: slug, noteId } = use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showIconPicker, setShowIconPicker] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    notesService.getById(noteId).then((n) => {
      setNote(n as Note)
      setTitle(n.title)
    }).catch(() => toast.error('Note introuvable'))
  }, [noteId])

  useEffect(() => {
    if (showTagInput) setTimeout(() => tagInputRef.current?.focus(), 50)
  }, [showTagInput])

  const saveNote = useCallback(async (updates: Partial<Note>) => {
    if (!note) return
    setSaving(true)
    try {
      const updated = await notesService.update(note.id, updates, {
        userId: user?.id,
        workspaceId: currentWorkspace?.id,
      })
      setNote(updated)
      setLastSaved(new Date())
    } catch {
      toast.error('Échec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [note, user?.id, currentWorkspace?.id])

  async function handleTitleBlur() {
    if (!note || title === note.title) return
    await saveNote({ title })
  }

  async function handleContentChange(content: Json) {
    if (!note) return
    // Estimate word count from JSON content
    const text = JSON.stringify(content)
    const words = text.replace(/<[^>]*>/g, ' ').replace(/[^a-zA-ZÀ-ÿ\s]/g, ' ').split(/\s+/).filter(w => w.length > 1)
    setWordCount(words.length)
    await saveNote({ content })
  }

  async function togglePin() {
    if (!note) return
    await saveNote({ is_pinned: !note.is_pinned })
    toast.success(note.is_pinned ? 'Note désépinglée' : 'Note épinglée')
  }

  async function archiveNote() {
    if (!note) return
    await saveNote({ is_archived: !note.is_archived })
    toast.success(note.is_archived ? 'Note restaurée' : 'Note archivée')
  }

  async function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag || !note) return
    if (note.tags?.includes(tag)) { setTagInput(''); return }
    const newTags = [...(note.tags ?? []), tag]
    await saveNote({ tags: newTags })
    setTagInput('')
    setShowTagInput(false)
  }

  async function removeTag(tag: string) {
    if (!note) return
    await saveNote({ tags: note.tags.filter(t => t !== tag) })
  }

  async function setIcon(icon: string) {
    if (!note) return
    await saveNote({ icon })
    setShowIconPicker(false)
  }

  async function copyLink() {
    const url = `${window.location.origin}/${slug}/notes/${noteId}`
    await navigator.clipboard.writeText(url)
    toast.success('Lien copié')
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        <span className="text-sm text-muted-foreground">Chargement…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-4 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur py-2 -mx-2 px-2 z-10">
        <Link href={`/${slug}/notes`}>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1" />
        {saving ? (
          <span className="text-xs text-muted-foreground animate-pulse">Sauvegarde…</span>
        ) : lastSaved ? (
          <span className="text-xs text-muted-foreground">
            Sauvegardé {formatDistanceToNow(lastSaved, { addSuffix: true, locale: fr })}
          </span>
        ) : null}
        {wordCount > 0 && (
          <span className="text-[10px] text-muted-foreground">{wordCount} mots</span>
        )}
        <FavoriteButton
          entityType="note" entityId={note.id}
          entityTitle={note.title || 'Sans titre'}
          entityUrl={`/${slug}/notes/${note.id}`}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLink} title="Copier le lien">
          <Share className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>} />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={togglePin}>
              <Pin className="mr-2 h-3.5 w-3.5" />
              {note.is_pinned ? 'Désépingler' : 'Épingler'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowTagInput(true)}>
              <Tag className="mr-2 h-3.5 w-3.5" /> Ajouter un tag
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={archiveNote} className={note.is_archived ? '' : 'text-destructive'}>
              <Archive className="mr-2 h-3.5 w-3.5" />
              {note.is_archived ? 'Restaurer' : 'Archiver'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Icon + Title */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          {/* Icon picker */}
          <div className="relative">
            <button
              className="text-4xl leading-none hover:scale-110 transition-transform"
              onClick={() => setShowIconPicker(!showIconPicker)}
              title="Changer l'icône"
            >
              {note.icon ?? '📄'}
            </button>
            {showIconPicker && (
              <div className="absolute top-12 left-0 z-20 bg-popover border border-border rounded-xl shadow-lg p-2 grid grid-cols-5 gap-1">
                {NOTE_ICONS.map(icon => (
                  <button key={icon} onClick={() => setIcon(icon)}
                    className="text-xl p-1.5 rounded hover:bg-accent transition-colors"
                  >{icon}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
              placeholder="Sans titre"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Modifié le {format(new Date(note.updated_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 ml-14">
          {(note.tags ?? []).map(tag => (
            <div key={tag} className="flex items-center gap-0.5 group">
              <Badge variant="secondary" className="text-[10px] h-5 px-2 gap-1 cursor-default">
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            </div>
          ))}

          {showTagInput ? (
            <div className="flex items-center gap-1">
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addTag()
                  if (e.key === 'Escape') { setShowTagInput(false); setTagInput('') }
                }}
                placeholder="tag…"
                className="h-5 text-[10px] px-2 rounded border border-border bg-background w-20 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={addTag} className="text-green-500 hover:text-green-400">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => { setShowTagInput(false); setTagInput('') }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-2.5 w-2.5" /> Tag
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <NoteEditor
        content={note.content}
        onChange={handleContentChange}
        className="mt-4 min-h-[400px]"
      />
    </div>
  )
}
