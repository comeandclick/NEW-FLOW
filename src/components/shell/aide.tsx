'use client'
// Aide & support (bouton « i » en bas du menu, 14/10/2026) : questions fréquentes, raccourcis, revoir les astuces,
// et un formulaire envoyé à l'équipe (visible dans l'admin → Aide & support).
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Keyboard, Lightbulb, Search, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const FAQ: [string, string][] = [
  ['Comment inviter quelqu\'un ?', 'Paramètres → Membres → Inviter : la personne reçoit un lien. Tu choisis son rôle (membre ou invité).'],
  ['Comment donner un espace à un client ?', 'Clients → Nouveau client, puis « Copier le lien du client ». Il voit seulement ses vidéos, ses tâches et la discussion.'],
  ['Comment lancer une vidéo ou un site ?', 'Relie d\'abord ton Mac avec l\'Atelier (Paramètres → Atelier), puis Motion design ou Création de site → Lancer.'],
  ['Mes données sont-elles exportables ?', 'Oui : Paramètres → Espace → Exporter. Tout part en fichiers lisibles, à tout moment.'],
  ['Comment masquer des entrées du menu ?', 'Clique sur « Modifier le menu » (crayon) en bas du menu, puis sur « − ». « Ajouter » les remet.'],
  ['Combien ça coûte ?', 'Pendant le lancement, tout est gratuit. Les offres sont visibles dans Paramètres → Abonnement.'],
]

export function Aide({ ouvert, fermer, raccourcis }: { ouvert: boolean; fermer: () => void; raccourcis: () => void }) {
  const [q, setQ] = useState(''), [deplie, setDeplie] = useState<number | null>(null)
  const [type, setType] = useState('aide'), [sujet, setSujet] = useState(''), [message, setMessage] = useState(''), [etat, setEtat] = useState<'' | 'envoi' | 'ok'>('')
  const faq = FAQ.map((x, i) => [...x, i] as const).filter(([a, b]) => !q || `${a} ${b}`.toLowerCase().includes(q.toLowerCase()))
  const envoyer = async () => {
    if (!sujet.trim() || !message.trim()) return
    setEtat('envoi')
    const r = await fetch('/api/support', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, sujet, message, page: location.pathname }) })
    if (r.ok) { setEtat('ok'); setSujet(''); setMessage('') } else { setEtat(''); toast.error('Envoi impossible pour le moment. Réessaie dans un instant.') }
  }
  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div className="fixed inset-0 z-[70] flex justify-start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={fermer} />
          <motion.aside role="dialog" aria-label="Aide et support" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative m-2 flex w-[min(420px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg md:ml-[268px]">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3"><h2 className="text-[15px] font-semibold">Aide & support</h2>
              <button onClick={fermer} aria-label="Fermer" className="ml-auto grid size-8 place-items-center rounded-md text-text-3 hover:bg-text/5 hover:text-text"><X className="size-4" /></button></div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-text-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans l'aide" className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-text/30" /></div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {faq.map(([a, b, i]) => (
                  <li key={i}>
                    <button onClick={() => setDeplie(deplie === i ? null : i)} className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[13.5px] font-medium">{a}<ChevronDown className={cn('ml-auto size-4 shrink-0 text-text-3 transition-transform', deplie === i && 'rotate-180')} /></button>
                    <AnimatePresence initial={false}>{deplie === i && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-3.5 pb-3 text-[13px] text-text-2">{b}</motion.p>}</AnimatePresence>
                  </li>))}
                {!faq.length && <li className="px-3.5 py-4 text-center text-[13px] text-text-3">Rien trouvé : écris-nous ci-dessous.</li>}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { fermer(); raccourcis() }} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px] hover:bg-surface-2"><Keyboard className="size-4 text-text-3" />Raccourcis</button>
                <button onClick={() => { try { localStorage.removeItem('flow_astuces_vues'); localStorage.removeItem('flow_astuces_off') } catch {} toast.success('Les astuces réapparaîtront sur chaque page') }} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px] hover:bg-surface-2"><Lightbulb className="size-4 text-text-3" />Revoir les astuces</button>
              </div>
              <div className="rounded-xl border border-border p-3.5">
                <h3 className="text-[13.5px] font-semibold">Écrire à l&apos;équipe</h3>
                {etat === 'ok' ? <p className="mt-3 flex items-center gap-2 text-[13px] text-success"><Check className="size-4" />Message envoyé : on te répond par e-mail.</p> : (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">{[['aide', 'Question'], ['bug', 'Problème'], ['idee', 'Idée'], ['abonnement', 'Abonnement']].map(([k, l]) => (
                      <button key={k} onClick={() => setType(k)} className={cn('h-7 rounded-full border px-2.5 text-xs', type === k ? 'border-transparent bg-text text-bg' : 'border-border text-text-2')}>{l}</button>))}</div>
                    <input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Sujet" className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-text/30" />
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explique ce qui se passe…" rows={4} className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-text/30" />
                    <button onClick={() => void envoyer()} disabled={!sujet.trim() || !message.trim() || etat === 'envoi'} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-text text-sm font-medium text-bg disabled:opacity-40"><Send className="size-3.5" />{etat === 'envoi' ? 'Envoi…' : 'Envoyer'}</button>
                  </div>)}
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
