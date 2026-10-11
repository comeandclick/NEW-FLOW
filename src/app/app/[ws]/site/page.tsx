'use client'
import { Suspense, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Database, Globe, Layers, LayoutTemplate, Rocket, ScanSearch, ShoppingBag, Sparkles, Terminal, Triangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Card, EmptyState, PageHeader, Switch, Tabs } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { INTERVIEW_SYSTEM_PROMPT, buildSitePrompt, understandingOf } from '@/lib/studio/prompts'
import { useStudio, useStudioReady } from '@/lib/studio/store'
import { useStudioMode, type Mode } from '@/lib/studio/api'
import { createAndSubmit } from '@/lib/studio/launch'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { LiveJobsList } from '@/components/studio/live-jobs'
import { ModeBanner } from '@/components/studio/mode-banner'
import type { RefItem, SiteKind } from '@/lib/studio/types'
import { BridgeChip } from '@/components/studio/bridge-chip'
import { ConnectPanel } from '@/components/studio/connect-panel'
import { Interview, type Answer } from '@/components/studio/interview'
import { JobCard } from '@/components/studio/job-card'
import { PromptPreview } from '@/components/studio/prompt-preview'
import { RefDropzone } from '@/components/studio/ref-dropzone'
import { ChoiceGrid, Section } from '@/components/studio/section'

type Tab = 'new' | 'projects' | 'connect'
const KINDS: { id: SiteKind; icon: typeof Globe }[] = [
  { id: 'showcase', icon: LayoutTemplate }, { id: 'shop', icon: ShoppingBag }, { id: 'landing', icon: Rocket }, { id: 'other', icon: Layers },
]

function NewProject({ onLaunched, mode }: { onLaunched: () => void; mode: Mode }) {
  const { ws } = useWorkspace()
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const addSite = useStudio((s) => s.addSite)
  const devices = useStudio((s) => s.devices)
  const [kind, setKind] = useState<SiteKind>('shop')
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [refs, setRefs] = useState<RefItem[]>([])
  const [withFigma, setFigma] = useState(true)
  const [withSupabase, setSupabase] = useState(true)
  const [withMotion, setMotion] = useState(false)
  const [motionBrief, setMotionBrief] = useState('')
  const [languages, setLanguages] = useState('')
  const [domain, setDomain] = useState('')
  const [phase, setPhase] = useState<'form' | 'interview'>('form')
  const [qa, setQa] = useState<Answer[]>([])
  const pct = understandingOf(kind, qa.map((a) => a.id))
  const ok = brief.trim().length >= 10

  const input = { title: title.trim() || brief.trim().slice(0, 40), siteKind: kind, brief: brief.trim(), refs, withFigma, withSupabase, withMotion, motionBrief, languages, domain, qa: qa.map(({ q, a }) => ({ q, a })) }
  const prompt = useMemo(() => buildSitePrompt(input), [input.title, kind, brief, refs, withFigma, withSupabase, withMotion, motionBrief, languages, domain, qa]) // eslint-disable-line react-hooks/exhaustive-deps

  const launch = async () => {
    if (mode === 'setup') { toast.error(c.live.setupTitle); return }
    if (mode === 'live') {
      try {
        await createAndSubmit({ kind: 'site', title: input.title, spec: { siteKind: kind, brief: input.brief, withFigma, withSupabase, withMotion, motionBrief, languages, domain, qa: input.qa, understanding: pct, wsSlug: ws.slug }, prompt, refs, workspaceId: ws.id })
        toast.success(c.site.launch)
      } catch { toast.error('Erreur'); return }
    } else {
      addSite({ ...input, understanding: pct })
      toast.success(c.site.launch, { description: devices.length ? undefined : c.bridge.offlineHint })
    }
    setTitle(''); setBrief(''); setRefs([]); setQa([]); setPhase('form')
    onLaunched()
  }

  const stack = [
    [ScanSearch, c.site.stackWebtwin, c.site.stackWebtwinD], [Terminal, c.site.stackClaude, c.site.stackClaudeD], [Sparkles, c.site.stackFigma, c.site.stackFigmaD],
    [Triangle, c.site.stackVercel, c.site.stackVercelD], [Database, c.site.stackSupabase, c.site.stackSupabaseD],
  ] as const

  return (
    <div className="space-y-5">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label={c.site.stack}>
        {stack.map(([I, t, d]) => (
          <li key={t} className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-2"><I className="size-4" /></span>
            <span className="min-w-0"><span className="block text-[13px] font-medium text-text">{t}</span><span className="block text-xs text-text-3">{d}</span></span>
          </li>
        ))}
      </ul>

      {phase === 'form' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Section step={1} title={c.site.kindTitle}>
              <ChoiceGrid value={kind} onChange={setKind} label={c.site.kindTitle}
                items={KINDS.map((k) => ({ value: k.id, title: c.site.kinds[k.id], hint: c.site.kindHints[k.id], visual: <span className="flex size-10 items-center justify-center rounded-xl bg-surface-3 text-text-2"><k.icon className="size-5" /></span> }))} />
            </Section>
            <Section step={2} title={c.site.needTitle}>
              <div className="grid gap-4">
                <Field label={c.site.nameLabel}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.site.namePlaceholder} /></Field>
                <Field label={c.site.needLabel} hint={`${brief.trim().length} / 10+`}><Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={c.site.needPlaceholder} className="min-h-32" /></Field>
              </div>
            </Section>
            <Section step={3} title={c.site.refsTitle} hint={c.site.refsHint}>
              <RefDropzone refs={refs} onChange={setRefs} copy={{ drop: c.motion.drop, addLink: c.motion.addLink, linkPlaceholder: c.motion.linkPlaceholder, addNote: c.motion.addNote, notePlaceholder: c.motion.notePlaceholder, remove: c.common.remove }} />
            </Section>
            <Section step={4} title={c.site.optionsTitle}>
              <div className="space-y-4">
                {([[c.site.optFigma, withFigma, setFigma, undefined], [c.site.optSupabase, withSupabase, setSupabase, undefined], [c.site.optMotion, withMotion, setMotion, c.site.optMotionHint]] as const).map(([label, v, set, hint]) => (
                  <div key={label} className="flex items-start gap-3"><Switch checked={v} onChange={set} label={label} /><div><p className="text-[13px] font-medium text-text">{label}</p>{hint && <p className="text-xs text-text-3">{hint}</p>}</div></div>
                ))}
                {withMotion && <Field label={c.motion.briefLabel} className="animate-fade-in"><Textarea value={motionBrief} onChange={(e) => setMotionBrief(e.target.value)} placeholder={c.motion.briefPlaceholder} /></Field>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`${c.site.langLabel} (${c.common.optional.toLowerCase()})`}><Input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder={c.site.langPlaceholder} /></Field>
                  <Field label={`${c.site.domainLabel}`}><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={c.site.domainPlaceholder} /></Field>
                </div>
              </div>
            </Section>
            <PromptPreview title={c.site.interviewPromptTitle} hint={c.site.interviewHint} prompt={INTERVIEW_SYSTEM_PROMPT} show={c.motion.showPrompt} hide={c.motion.hidePrompt} copy={c.common.copy} copied={c.common.copied} />
          </div>
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-text">{c.site.interviewTitle}</h2>
              <p className="text-[13px] text-text-3">{c.site.interviewHint}</p>
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={!ok} onClick={() => setPhase('interview')}>{c.site.startInterview}<ArrowRight className="size-4" /></Button>
              {!ok && <p className="text-xs text-text-3">{c.motion.needBrief}</p>}
            </Card>
          </aside>
        </div>
      ) : (
        <div className="space-y-5">
          <Interview kind={kind} answers={qa} onAnswers={setQa} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setPhase('form')}>{c.common.back}</Button>
            <span className="flex-1" />
            <Button variant="primary" size="lg" onClick={() => void launch()} disabled={pct < 100}><Rocket className="size-4" />{c.site.launch}</Button>
          </div>
          {pct >= 100 && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-text-2">{c.site.interviewDoneHint}</p>}
          <PromptPreview title={c.site.promptTitle} prompt={prompt} show={c.motion.showPrompt} hide={c.motion.hidePrompt} copy={c.common.copy} copied={c.common.copied} defaultOpen={pct >= 100} />
        </div>
      )}
    </div>
  )
}

function SiteInner() {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = (['new', 'projects', 'connect'].includes(params.get('tab') ?? '') ? params.get('tab') : 'new') as Tab
  const ready = useStudioReady()
  const { mode, reason } = useStudioMode()
  const jobs = useStudio((s) => s.jobs).filter((j) => j.kind === 'site')
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false })

  return (
    <div className="mx-auto max-w-6xl p-6 max-md:p-4">
      <PageHeader icon={<Globe className="size-4" />} title={c.site.title} subtitle={c.site.subtitle}
        actions={<BridgeChip online={c.bridge.online} offline={c.bridge.offline} />} />
      <ModeBanner mode={mode} reason={reason} />
      <Tabs<Tab> className="mb-5" value={tab} onChange={setTab}
        items={[{ value: 'new', label: c.site.tabNew }, { value: 'projects', label: `${c.site.tabProjects}${jobs.length ? ` (${jobs.length})` : ''}` }, { value: 'connect', label: c.site.tabConnect }]} />
      {tab === 'new' && <NewProject mode={mode} onLaunched={() => setTab('projects')} />}
      {tab === 'projects' && (mode === 'live' ? <LiveJobsList kind="site" title={c.site.projectsEmpty} hint={c.site.projectsEmptyHint} /> : !ready ? null : jobs.length === 0 ? (
        <Card><EmptyState icon={<Globe className="size-5" />} title={c.site.projectsEmpty} hint={c.site.projectsEmptyHint} action={<Button variant="primary" onClick={() => setTab('new')}>{c.site.tabNew}</Button>} /></Card>
      ) : <div className="space-y-3">{jobs.map((j, i) => <JobCard key={j.id} job={j} defaultOpen={i === 0} />)}</div>)}
      {tab === 'connect' && <ConnectPanel live={mode === 'live'} />}
    </div>
  )
}

export default function SitePage() {
  return <Suspense fallback={null}><SiteInner /></Suspense>
}
