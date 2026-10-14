'use client'
// IA dans les notes (14/10/2026) :
// - « Rédiger avec l'IA » (barre d'outils) : on demande (« rédige 4 idées de motion pour ce projet »), le texte s'insère
//   à l'endroit du curseur, proprement numéroté. L'IA lit toute la note, les autres notes et les dossiers clients.
// - texte sélectionné → bouton « Améliorer » juste au-dessus : corrige et reformule sans rien retirer (Annuler = Ctrl+Z).
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Loader2, Sparkles, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { mdToDoc } from '@/lib/md-doc'
import { cn } from '@/lib/utils'

const ERREURS: Record<string, string> = { limite: 'L\'IA a atteint sa limite gratuite pour l\'instant. Réessaie dans une minute.', no_key: 'Aucune IA configurée.', unauthorized: 'Reconnecte-toi.' }
async function appeler(corps: Record<string, unknown>) {
  const r = await fetch('/api/ai/redaction', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.texte) throw new Error(ERREURS[j.error] ?? 'L\'IA n\'a pas pu répondre. Réessaie.')
  return String(j.texte)
}
const contenuDe = (md: string) => mdToDoc(md).content as Record<string, unknown>[]

export function RedigerIA({ editor, noteId }: { editor: Editor; noteId: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [consigne, setConsigne] = useState('')
  const [envoi, setEnvoi] = useState(false)
  async function rediger() {
    if (!consigne.trim() || envoi) return
    setEnvoi(true)
    try {
      const md = await appeler({ mode: 'rediger', consigne: consigne.trim(), noteId, texteActuel: editor.getText({ blockSeparator: '\n' }) })
      editor.chain().focus().insertContent(contenuDe(md)).run()
      setConsigne(''); setOuvert(false)
    } catch (e) { toast.error((e as Error).message) } finally { setEnvoi(false) }
  }
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className={cn('flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors', ouvert ? 'bg-text text-bg' : 'text-text hover:bg-surface-3')}>
        <Sparkles className="size-4" /><span className="hidden sm:inline">Rédiger avec l&apos;IA</span>
      </button>
      <AnimatePresence>{ouvert && (
        <motion.form initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} onSubmit={(e) => { e.preventDefault(); void rediger() }}
          className="fixed inset-x-0 top-20 z-50 mx-auto w-[min(460px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-2 shadow-xl">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-2 size-4 shrink-0 text-text-3" />
            <textarea autoFocus value={consigne} onChange={(e) => setConsigne(e.target.value)} rows={2} disabled={envoi}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void rediger() } if (e.key === 'Escape') setOuvert(false) }}
              placeholder="Ex. rédige 4 idées de motion pour ce projet" className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-text-3 sm:text-[14px]" />
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="mt-1 text-text-3 hover:text-text"><X className="size-4" /></button>
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <span className="flex-1 text-[11.5px] text-text-3">{envoi ? 'Je lis la note et le projet…' : 'L\'IA lit cette note, tes autres notes et tes dossiers clients.'}</span>
            <button type="submit" disabled={!consigne.trim() || envoi} className="grid size-8 place-items-center rounded-lg bg-text text-bg disabled:opacity-30" aria-label="Rédiger">{envoi ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button>
          </div>
        </motion.form>)}</AnimatePresence>
    </div>
  )
}

/** Bouton qui apparaît juste au-dessus du texte sélectionné. */
export function AmeliorerSelection({ editor, noteId }: { editor: Editor; noteId: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const maj = () => {
      const { from, to, empty } = editor.state.selection
      if (empty || !editor.isEditable || editor.state.doc.textBetween(from, to, ' ').trim().length < 3) { if (!envoi) setPos(null); return }
      const a = editor.view.coordsAtPos(from), b = editor.view.coordsAtPos(to)
      const parent = boite.current?.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }
      setPos({ x: Math.max(8, (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 - parent.left), y: Math.min(a.top, b.top) - parent.top })
    }
    const flou = () => setTimeout(() => { if (!envoi && !editor.isFocused) setPos(null) }, 150)
    editor.on('selectionUpdate', maj); editor.on('blur', flou)
    return () => { editor.off('selectionUpdate', maj); editor.off('blur', flou) }
  }, [editor, envoi])
  async function ameliorer() {
    const { from, to } = editor.state.selection
    // texte de la sélection, en gardant les retours à la ligne et les listes
    const selection = editor.state.doc.textBetween(from, to, '\n', ' ')
    setEnvoi(true)
    try {
      const md = await appeler({ mode: 'ameliorer', selection, noteId })
      editor.chain().focus().insertContentAt({ from, to }, contenuDe(md)).run()
      toast.success('Texte amélioré', { description: 'Ctrl+Z (ou Cmd+Z) pour revenir en arrière.' })
      setPos(null)
    } catch (e) { toast.error((e as Error).message) } finally { setEnvoi(false) }
  }
  return (
    <div ref={boite} className="pointer-events-none absolute left-0 top-0 z-20">
      <AnimatePresence>{pos && (
        <motion.button type="button" initial={{ opacity: 0, y: 4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          onMouseDown={(e) => e.preventDefault()} onClick={() => void ameliorer()} disabled={envoi}
          style={{ left: pos.x, top: pos.y - 44 }} className="pointer-events-auto absolute flex h-9 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-text px-3.5 text-[13px] font-medium text-bg shadow-lg">
          {envoi ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}{envoi ? 'Je corrige…' : 'Améliorer avec l\'IA'}
        </motion.button>)}</AnimatePresence>
    </div>
  )
}
