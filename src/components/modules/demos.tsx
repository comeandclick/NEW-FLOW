'use client'
// Petits exemples utilisables de chaque fonctionnalité (15/10/2026), montrés au choix des fonctionnalités comme sur la vitrine :
// rien n'est enregistré, tout se passe dans la page.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CheckCircle2, Clapperboard, FileImage, FileText, Folder, Globe, Camera, Image as ImageIcon, Link2, Lock, Pause, PenLine, Play, Plus, ScanLine, Sparkles, Wrench } from 'lucide-react'
import { ChatMock, CrmMock, Frame, NotesMock } from '@/components/site/mocks'
import { cn } from '@/lib/utils'
import type { ModuleId } from '@/lib/modules'

const eur = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const Barre = ({ v, className }: { v: number; className?: string }) => (
  <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-3', className)}><motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.min(100, v)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
)

function FichiersDemo() {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const dossiers = { Chantiers: ['Photos avant.jpg', 'Plan cuisine.pdf'], Clients: ['Contrat Dupont.pdf'], Motion: ['Pub v3.mp4', 'Logo.png'] } as Record<string, string[]>
  return (
    <Frame className="p-3">
      <div className="mb-2 text-[12px] font-semibold">{ouvert ? <button onClick={() => setOuvert(null)} className="text-text-3 hover:text-text">Fichiers /</button> : 'Fichiers'} {ouvert}</div>
      <div className="grid grid-cols-3 gap-2">
        {(ouvert ? dossiers[ouvert] : Object.keys(dossiers)).map((n) => (
          <motion.button layout key={n} onClick={() => !ouvert && setOuvert(n)} className="flex flex-col items-center gap-1 rounded-lg border border-border p-2 text-[10.5px] hover:bg-surface-2">
            {ouvert ? (n.endsWith('.pdf') ? <FileText className="size-6 text-danger" /> : <FileImage className="size-6 text-info" />) : <Folder className="size-6 text-warning" />}
            <span className="w-full truncate text-center">{n}</span>
          </motion.button>))}
      </div>
    </Frame>
  )
}

function CapturesDemo() {
  const [items, setItems] = useState([{ t: 'Astuce montage TikTok', k: 'TikTok', vu: false }, { t: 'Article SEO local', k: 'Lien', vu: true }])
  return (
    <Frame className="space-y-2 p-3">
      <button onClick={() => setItems((x) => [{ t: 'Reel inspiration logo', k: 'Instagram', vu: false }, ...x])} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-2 text-[11px] text-text-2 hover:bg-surface-2"><Plus className="size-3.5" />Partager depuis le téléphone</button>
      <AnimatePresence initial={false}>{items.map((c, i) => (
        <motion.div key={c.t + i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-lg border border-border p-2 text-[11px]">
          {c.k === 'Instagram' ? <Camera className="size-4 text-text-3" /> : c.k === 'Lien' ? <Link2 className="size-4 text-text-3" /> : <ImageIcon className="size-4 text-text-3" />}
          <span className="min-w-0 flex-1 truncate">{c.t}</span>
          <button onClick={() => setItems((x) => x.map((y, j) => (j === i ? { ...y, vu: true } : y)))} className={cn('rounded-full px-2 py-0.5 text-[10px]', c.vu ? 'bg-success/15 text-success' : 'bg-accent-soft text-accent')}>{c.vu ? 'Trié par l’IA' : 'Analyser'}</button>
        </motion.div>))}</AnimatePresence>
    </Frame>
  )
}

function ObjectifsDemo() {
  const [v, setV] = useState([40, 70])
  return (
    <Frame className="space-y-3 p-3">
      {['20 vidéos ce mois', '10 nouveaux clients'].map((n, i) => (
        <div key={n}><div className="mb-1 flex justify-between text-[11.5px]"><span className="font-medium">{n}</span><span className="tabular-nums text-text-3">{v[i]} %</span></div>
          <Barre v={v[i]} /><button onClick={() => setV((x) => x.map((y, j) => (j === i ? Math.min(100, y + 10) : y)))} className="mt-1 text-[10px] text-accent">+ avancer</button></div>))}
    </Frame>
  )
}

function ClientsDemo() {
  const [statut, setStatut] = useState<'livree' | 'validee'>('livree')
  return (
    <Frame className="p-3">
      <div className="mb-2 flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">SB</span><div><div className="text-[12px] font-semibold">Studio Bloom</div><div className="text-[10px] text-text-3">3 vidéos par semaine</div></div></div>
      <div className="flex items-center gap-2 rounded-lg border border-border p-2 text-[11px]"><Clapperboard className="size-4 text-text-3" /><span className="flex-1">Pub printemps v2.mp4</span>
        <button onClick={() => setStatut((s) => (s === 'livree' ? 'validee' : 'livree'))} className={cn('rounded-full px-2 py-0.5 text-[10px]', statut === 'validee' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>{statut === 'validee' ? 'Validée par le client' : 'À valider'}</button></div>
      <div className="mt-2 text-[10px] text-text-3">Le client voit ses vidéos et répond depuis son lien privé.</div>
    </Frame>
  )
}

function MotionDemo() {
  const etapes = ['Script', 'Voix', 'Animation', 'Son', 'Rendu']
  const [n, setN] = useState(2)
  useEffect(() => { const t = setInterval(() => setN((x) => (x + 1) % (etapes.length + 1)), 1400); return () => clearInterval(t) }, [etapes.length])
  return (
    <Frame className="p-3">
      <div className="mb-2 flex justify-between text-[12px] font-semibold"><span>Pub Kalimat 40 s</span><span className="tabular-nums text-text-3">{Math.round((n / etapes.length) * 100)} %</span></div>
      <Barre v={(n / etapes.length) * 100} className="mb-2.5" />
      <div className="flex flex-wrap gap-1.5">{etapes.map((e, i) => <span key={e} className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors', i < n ? 'bg-success/15 text-success' : i === n ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-text-3')}>{i < n && <Check className="size-2.5" />}{e}</span>)}</div>
    </Frame>
  )
}

function SiteDemo() {
  const [todo, setTodo] = useState([['Maquette accueil', true], ['Formulaire contact', false], ['Mise en ligne', false]] as [string, boolean][])
  return (
    <Frame className="p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold"><Globe className="size-4 text-text-3" />lumora-studio.fr<span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-normal text-success">en ligne</span></div>
      {todo.map(([t, f], i) => (
        <button key={t} onClick={() => setTodo((x) => x.map((y, j) => (j === i ? [y[0], !y[1]] : y)))} className="flex w-full items-center gap-2 py-1 text-left text-[11.5px]">
          <span className={cn('flex size-3.5 items-center justify-center rounded border', f ? 'border-text bg-text text-bg' : 'border-border-strong')}>{f && <Check className="size-2.5" strokeWidth={3} />}</span><span className={cn(f && 'text-text-3 line-through')}>{t}</span></button>))}
    </Frame>
  )
}

function SocialDemo() {
  const jours = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const [posts, setPosts] = useState([1, 3])
  return (
    <Frame className="p-3">
      <div className="mb-2 text-[12px] font-semibold">Publications de la semaine</div>
      <div className="grid grid-cols-7 gap-1">{jours.map((j, i) => (
        <button key={i} onClick={() => setPosts((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} className={cn('flex aspect-square flex-col items-center justify-center rounded-md border text-[10px] transition-colors', posts.includes(i) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-3')}>
          {j}{posts.includes(i) && <span className="mt-0.5 size-1.5 rounded-full bg-accent" />}</button>))}</div>
      <div className="mt-2 text-[10px] text-text-3">{posts.length} publications programmées · TikTok, Instagram</div>
    </Frame>
  )
}

function FocusDemo() {
  const [s, setS] = useState(25 * 60), [on, setOn] = useState(false)
  useEffect(() => { if (!on) return; const t = setInterval(() => setS((x) => Math.max(0, x - 7)), 100); return () => clearInterval(t) }, [on])
  return (
    <Frame className="flex flex-col items-center gap-2 p-4">
      <div className="text-[28px] font-semibold tabular-nums tracking-tight">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</div>
      <Barre v={100 - (s / 1500) * 100} className="w-full" />
      <button onClick={() => setOn((x) => !x)} className="flex items-center gap-1.5 rounded-full bg-text px-3 py-1 text-[11px] text-bg">{on ? <Pause className="size-3" /> : <Play className="size-3" />}{on ? 'Pause' : 'Concentration'}</button>
    </Frame>
  )
}

function MonEspaceDemo() {
  const [txt, setTxt] = useState('Idées perso : refaire le portfolio')
  return (
    <Frame className="p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold"><Lock className="size-3.5 text-text-3" />Mon espace<span className="ml-auto text-[10px] font-normal text-text-3">visible par toi seul</span></div>
      <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-border bg-surface-2/50 p-2 text-[11.5px] outline-none" aria-label="Note privée" />
    </Frame>
  )
}

function DevisDemo() {
  const [lignes, setLignes] = useState([{ l: 'Chauffe-eau 200 L', q: 1, p: 690 }, { l: 'Main d’œuvre (h)', q: 3, p: 55 }])
  const [statut, setStatut] = useState<'attente' | 'signe'>('attente')
  const ht = lignes.reduce((a, x) => a + x.q * x.p, 0)
  return (
    <Frame className="p-3">
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold"><span>Devis DE-2026-0042</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-normal', statut === 'signe' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>{statut === 'signe' ? 'Accepté · signé' : 'En attente'}</span></div>
      <div className="space-y-1 text-[11px]">{lignes.map((x, i) => (
        <div key={x.l} className="flex items-center gap-2"><span className="flex-1 truncate">{x.l}</span>
          <button onClick={() => setLignes((L) => L.map((y, j) => (j === i ? { ...y, q: y.q + 1 } : y)))} className="rounded bg-surface-3 px-1.5 tabular-nums">× {x.q}</button><span className="w-16 text-right tabular-nums">{eur(x.q * x.p)}</span></div>))}</div>
      <div className="mt-2 space-y-0.5 border-t border-border pt-2 text-[11px] tabular-nums"><div className="flex justify-between text-text-3"><span>Total HT</span><span>{eur(ht)}</span></div><div className="flex justify-between text-text-3"><span>TVA 20 %</span><span>{eur(ht * 0.2)}</span></div><div className="flex justify-between font-semibold"><span>Total TTC</span><span>{eur(ht * 1.2)}</span></div></div>
      <button onClick={() => setStatut('signe')} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-text py-1.5 text-[11px] text-bg"><PenLine className="size-3.5" />{statut === 'signe' ? 'Signé par M. Dupont' : 'Faire signer le client'}</button>
    </Frame>
  )
}

function InterventionsDemo() {
  const [l, setL] = useState([{ t: 'Dépannage chaudière', c: 'Mme Leroy', e: 1 }, { t: 'Installation clim', c: 'Boulangerie Petit', e: 0 }, { t: 'Désinstallation ballon', c: 'M. Garnier', e: 2 }])
  const etats = ['Planifiée', 'En cours', 'Clôturée']
  return (
    <Frame className="space-y-1.5 p-3">
      {l.map((x, i) => (
        <div key={x.t} className="flex items-center gap-2 rounded-lg border border-border p-2 text-[11px]"><Wrench className="size-3.5 text-text-3" /><div className="min-w-0 flex-1"><div className="truncate font-medium">{x.t}</div><div className="truncate text-[10px] text-text-3">{x.c} · IN-2026-01{i + 2}</div></div>
          <button onClick={() => setL((L) => L.map((y, j) => (j === i ? { ...y, e: (y.e + 1) % 3 } : y)))} className={cn('rounded-full px-2 py-0.5 text-[10px]', ['bg-info/15 text-info', 'bg-warning/15 text-warning', 'bg-success/15 text-success'][x.e])}>{etats[x.e]}</button></div>))}
    </Frame>
  )
}

function FacturesIADemo() {
  const [etape, setEtape] = useState(0)
  useEffect(() => { if (etape === 1) { const t = setTimeout(() => setEtape(2), 1100); return () => clearTimeout(t) } }, [etape])
  return (
    <Frame className="p-3">
      {etape === 0 && <button onClick={() => setEtape(1)} className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong py-5 text-[11px] text-text-2 hover:bg-surface-2"><ScanLine className="size-5" />Déposer la photo d’une facture</button>}
      {etape === 1 && <div className="flex flex-col items-center gap-2 py-5 text-[11px] text-text-3"><Sparkles className="size-5 animate-pulse text-accent" />L’IA lit la facture…</div>}
      {etape === 2 && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="size-4 text-success" />Facture Cedeo · 1 068,00 € TTC</div>
        <div className="text-text-3">Client : Dupont · 12 oct. · échéance 12 nov.</div>
        <div className="flex flex-wrap gap-1.5 pt-1">{['Ajouter aux factures', 'Rappel au calendrier', 'Créer une tâche'].map((b) => <span key={b} className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">{b}</span>)}</div>
        <button onClick={() => setEtape(0)} className="text-[10px] text-text-3 underline">Recommencer</button></motion.div>}
    </Frame>
  )
}

export function DemoModule({ id }: { id: ModuleId }) {
  switch (id) {
    case 'messages': return <ChatMock />
    case 'notes': return <NotesMock />
    case 'crm': return <CrmMock />
    case 'files': return <FichiersDemo />
    case 'captures': return <CapturesDemo />
    case 'goals': return <ObjectifsDemo />
    case 'clients': return <ClientsDemo />
    case 'motion': return <MotionDemo />
    case 'site': return <SiteDemo />
    case 'social': return <SocialDemo />
    case 'focus': return <FocusDemo />
    case 'me': return <MonEspaceDemo />
    case 'facturation': return <DevisDemo />
    case 'interventions': return <InterventionsDemo />
    case 'factures_ia': return <FacturesIADemo />
  }
}
