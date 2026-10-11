'use client'
import { useMemo, useState } from 'react'
import { ArrowRight, Clapperboard, Film, Gauge } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Card, EmptyState, PageHeader, Switch } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { buildMotionPrompt, type Engine } from '@/lib/studio/prompts'
import { useStudio, useStudioReady } from '@/lib/studio/store'
import { useStudioMode, usePoll, studioApi } from '@/lib/studio/api'
import { createAndSubmit } from '@/lib/studio/launch'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { LiveJobsList } from '@/components/studio/live-jobs'
import { ModeBanner } from '@/components/studio/mode-banner'
import { QUALITIES, RATIOS, dimensions, type AudioMode, type QualityId, type Ratio, type RefItem } from '@/lib/studio/types'
import { cn } from '@/lib/utils'
import { BridgeChip } from '@/components/studio/bridge-chip'
import { JobCard } from '@/components/studio/job-card'
import { PromptPreview } from '@/components/studio/prompt-preview'
import { RefDropzone } from '@/components/studio/ref-dropzone'
import { ChoiceGrid, Section } from '@/components/studio/section'

function RatioShape({ w, h, on }: { w: number; h: number; on: boolean }) {
  const k = 40 / Math.max(w, h)
  return <span className={cn('rounded-[5px] border-2', on ? 'border-accent bg-accent/15' : 'border-border-strong bg-surface-2')} style={{ width: w * k, height: h * k }} aria-hidden />
}

export default function MotionPage() {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const ready = useStudioReady()
  const { mode, reason } = useStudioMode()
  const { ws } = useWorkspace()
  const jobs = useStudio((s) => s.jobs).filter((j) => j.kind === 'motion')
  const devices = useStudio((s) => s.devices)
  const addMotion = useStudio((s) => s.addMotion)

  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [brand, setBrand] = useState('')
  const [refs, setRefs] = useState<RefItem[]>([])
  const [ratio, setRatio] = useState<Ratio>('16:9')
  const [quality, setQuality] = useState<QualityId>('4k')
  const [fps, setFps] = useState<30 | 60>(60)
  const [duration, setDuration] = useState(15)
  const [audio, setAudio] = useState<AudioMode>('sfx')
  const [verify, setVerify] = useState(true)
  const [engine, setEngine] = useState<Engine>('auto')
  const devs = usePoll(studioApi.devices, 6000, mode === 'live')
  const ready_ = (id: string) => (devs.data?.devices ?? []).some((d) => d.setup?.components.some((x) => x.id === id && x.state === 'ok'))
  const [busy, setBusy] = useState(false)

  const dim = dimensions(ratio, quality)
  const frames = Math.round(duration * fps)
  const prompt = useMemo(() => buildMotionPrompt({ title, brief, ratio, quality, fps, durationSec: duration, audio, brand, refs, verify, engine }), [title, brief, ratio, quality, fps, duration, audio, brand, refs, verify, engine])
  const ok = brief.trim().length >= 10

  const launch = async () => {
    if (!ok) { toast.error(c.motion.needBrief); return }
    if (mode === 'setup') { toast.error(c.live.setupTitle); return }
    setBusy(true)
    if (mode === 'live') {
      try {
        const id = await createAndSubmit({ kind: 'motion', title: title.trim() || brief.trim().slice(0, 40), spec: { ratio, quality, fps, durationSec: duration, audio, brand, verify, engine, brief: brief.trim(), wsSlug: ws.slug }, prompt, refs, workspaceId: ws.id })
        toast.success(c.motion.sent)
        setTitle(''); setBrief(''); setRefs([])
        requestAnimationFrame(() => document.getElementById(`job-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      } catch { toast.error('Erreur') } finally { setBusy(false) }
      return
    }
    const j = addMotion({ title: title.trim() || brief.trim().slice(0, 40), brief: brief.trim(), ratio, quality, fps, durationSec: duration, audio, brand, refs, verify })
    toast.success(c.motion.sent, { description: devices.length ? undefined : c.bridge.offlineHint })
    setTimeout(() => setBusy(false), 400)
    setTitle(''); setBrief(''); setRefs([])
    requestAnimationFrame(() => document.getElementById(`job-${j.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  return (
    <div className="mx-auto max-w-6xl p-6 max-md:p-4">
      <PageHeader icon={<Clapperboard className="size-4" />} title={c.motion.title} subtitle={c.motion.subtitle}
        actions={<BridgeChip online={c.bridge.online} offline={c.bridge.offline} />} />

      <ModeBanner mode={mode} reason={reason} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Section step={1} title={c.motion.secBrief}>
            <div className="grid gap-4">
              <Field label={c.motion.titleLabel}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.motion.titlePlaceholder} /></Field>
              <Field label={c.motion.briefLabel} hint={`${brief.trim().length} / 10+`}>
                <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={c.motion.briefPlaceholder} className="min-h-32" />
              </Field>
              <Field label={`${c.motion.brandLabel} (${c.common.optional.toLowerCase()})`}><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={c.motion.brandPlaceholder} /></Field>
            </div>
          </Section>

          <Section step={2} title={c.motion.secRefs} hint={c.motion.refsHint}>
            <RefDropzone refs={refs} onChange={setRefs} copy={{ drop: c.motion.drop, addLink: c.motion.addLink, linkPlaceholder: c.motion.linkPlaceholder, addNote: c.motion.addNote, notePlaceholder: c.motion.notePlaceholder, remove: c.common.remove }} />
          </Section>

          <Section step={3} title={c.motion.secFormat}>
            <ChoiceGrid value={ratio} onChange={setRatio} label={c.motion.secFormat}
              items={RATIOS.map((r) => ({ value: r.id, title: `${locale === 'en' ? r.labelEn : r.labelFr} · ${r.id}`, hint: locale === 'en' ? r.useEn : r.useFr, visual: <RatioShape w={r.w} h={r.h} on={ratio === r.id} /> }))} />
          </Section>

          <div className="grid gap-5 md:grid-cols-2">
            <Section step={4} title={c.motion.secDuration} hint={c.motion.durationHint}>
              <div className="flex items-center gap-3">
                <input type="range" min={3} max={60} step={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-1.5 flex-1 accent-[var(--accent)]" aria-label={c.motion.secDuration} />
                <div className="flex w-20 items-center gap-1"><Input type="number" min={3} max={60} value={duration} onChange={(e) => setDuration(Math.min(60, Math.max(3, Number(e.target.value) || 3)))} className="text-center" aria-label={c.motion.secDuration} /><span className="text-xs text-text-3">{c.common.sec}</span></div>
              </div>
              <div className="mt-4"><p className="mb-2 text-[13px] font-medium text-text-2">{c.motion.secFps}</p>
                <ChoiceGrid value={fps} onChange={setFps} label={c.motion.secFps} cols="sm:grid-cols-2" items={[{ value: 30, title: '30 i/s', hint: locale === 'en' ? 'Standard' : 'Standard' }, { value: 60, title: '60 i/s', hint: locale === 'en' ? 'Ultra smooth' : 'Ultra fluide' }]} />
              </div>
            </Section>
            <Section step={5} title={c.motion.secQuality} hint={c.motion.qualityNote}>
              <ChoiceGrid value={quality} onChange={setQuality} label={c.motion.secQuality} cols="sm:grid-cols-3"
                items={QUALITIES.map((q) => ({ value: q.id, title: locale === 'en' ? q.labelEn : q.labelFr, hint: locale === 'en' ? q.hintEn : q.hintFr, badge: q.id === '4k' ? 'Pro' : undefined }))} />
            </Section>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Section step={6} title={c.motion.secAudio}>
              <ChoiceGrid value={audio} onChange={setAudio} label={c.motion.secAudio} cols="sm:grid-cols-1"
                items={[{ value: 'none', title: c.motion.audioNone }, { value: 'sfx', title: c.motion.audioSfx }, { value: 'music_sfx', title: c.motion.audioMusic }]} />
            </Section>
            <Section step={7} title={c.setup.engineTitle} hint={c.setup.engineHint}>
              <ChoiceGrid value={engine} onChange={setEngine} label={c.setup.engineChoose} cols="sm:grid-cols-1"
                items={([
                  ['auto', c.setup.engineAuto, undefined],
                  ['effectcraft', `EffectCraft · ${c.setup.free}`, ready_('effectcraft')],
                  ['aftereffects', `After Effects · ${c.setup.paid}`, ready_('aftereffects')],
                  ['remotion', `Remotion · ${c.setup.free}`, ready_('remotion')],
                ] as const).map(([v, t, ok]) => ({ value: v as Engine, title: t, hint: mode === 'live' && ok !== undefined ? (ok ? c.setup.states.ok : c.setup.states.missing) : undefined }))} />
            </Section>
            <Section step={8} title={c.motion.secVerify}>
              <div className="flex items-start gap-3">
                <Switch checked={verify} onChange={setVerify} label={c.motion.verifyLabel} />
                <div><p className="text-[13px] font-medium text-text">{c.motion.verifyLabel}</p><p className="text-xs text-text-3">{c.motion.verifyHint}</p></div>
              </div>
            </Section>
          </div>

          <PromptPreview title={c.motion.promptTitle} hint={c.motion.promptHint} prompt={prompt} show={c.motion.showPrompt} hide={c.motion.hidePrompt} copy={c.common.copy} copied={c.common.copied} />
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-text">{c.motion.summary}</h2>
            <dl className="space-y-2.5 text-[13px]">
              {[
                [c.motion.sumFormat, `${RATIOS.find((r) => r.id === ratio)![locale === 'en' ? 'labelEn' : 'labelFr']} ${ratio}`],
                [c.motion.sumSize, `${dim.w} × ${dim.h}`],
                [c.motion.sumLength, `${duration} ${c.common.sec} · ${fps} i/s`],
                [c.motion.sumFrames, String(frames)],
                [c.motion.sumRefs, String(refs.length)],
                [c.motion.sumAudio, audio === 'none' ? c.motion.audioNone : audio === 'sfx' ? c.motion.audioSfx : c.motion.audioMusic],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-text-3">{k}</dt><dd className="text-right font-medium text-text">{v}</dd></div>)}
            </dl>
            <Button variant="primary" size="lg" className="w-full justify-center" onClick={launch} loading={busy} disabled={!ok}>{busy ? c.motion.launching : c.motion.launch}<ArrowRight className="size-4" /></Button>
            {!ok && <p className="text-xs text-text-3">{c.motion.needBrief}</p>}
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">{c.motion.howTitle}</h3>
              <ol className="space-y-2 text-[13px] text-text-2">
                {[c.motion.how1, c.motion.how2, c.motion.how3, c.motion.how4].map((x, i) => (
                  <li key={i} className="flex gap-2.5"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-text-2">{i + 1}</span>{x}</li>
                ))}
              </ol>
            </div>
          </Card>
        </aside>
      </div>

      <section className="mt-8" aria-labelledby="motion-jobs">
        <h2 id="motion-jobs" className="mb-3 flex items-center gap-2 text-sm font-semibold text-text"><Gauge className="size-4 text-text-3" />{c.motion.jobs}</h2>
        {mode === 'live' ? <LiveJobsList kind="motion" title={c.motion.jobsEmpty} hint={c.motion.jobsEmptyHint} /> : !ready ? null : jobs.length === 0 ? (
          <Card><EmptyState icon={<Film className="size-5" />} title={c.motion.jobsEmpty} hint={c.motion.jobsEmptyHint} /></Card>
        ) : (
          <div className="space-y-3">{jobs.map((j, i) => <div id={`job-${j.id}`} key={j.id}><JobCard job={j} defaultOpen={i === 0} /></div>)}</div>
        )}
      </section>
    </div>
  )
}
