'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, CalendarClock, CheckCircle, ChevronRight, Clapperboard, Play, Repeat, Settings, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Card, EmptyState, PageHeader, Switch } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform, type SocialAccount, type SocialSeries, type SocialTemplate, type VoiceOption, type Recurrence } from '@/lib/social/types'
import { PlatformIcon } from '@/components/social/platform-icon'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { isDemoBrowser } from '@/lib/demo/runtime'

type Step = 1 | 2 | 3 | 4 | 5

const VOICE_OPTIONS: { value: VoiceOption; label: string }[] = [
  { value: 'ar', label: 'Arabe' },
  { value: 'fr', label: 'Français' },
  { value: 'ar+fr', label: 'Les deux' },
]

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'daily', label: 'Chaque jour' },
  { value: 'every2days', label: 'Tous les 2 jours' },
  { value: 'weekly', label: 'Chaque semaine' },
]

const DEFAULT_SUGGESTIONS = [
  "Comment dire 'merci' en arabe",
  "Comment dire 'bonjour' en arabe",
  "Comment dire 'au revoir' en arabe",
  "Comment dire 'je m'appelle...' en arabe",
  "Comment dire 'félicitations' en arabe",
]

function todayNoon(): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  if (d <= new Date()) d.setDate(d.getDate() + 1)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function PreparePage() {
  const t = useT()
  const { ws } = useWorkspace()
  const router = useRouter()

  const [step, setStep] = useState<Step>(1)
  const [templates, setTemplates] = useState<SocialTemplate[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [series, setSeries] = useState<SocialSeries[]>([])

  const [selectedTemplate, setSelectedTemplate] = useState<SocialTemplate | null>(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeDesc, setNewTypeDesc] = useState('')
  const [showNewType, setShowNewType] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<SocialTemplate | null>(null)

  const [brief, setBrief] = useState('')
  const [voice, setVoice] = useState<VoiceOption>('ar+fr')
  const [sfx, setSfx] = useState(true)

  const [automate, setAutomate] = useState(false)
  const [recurrence, setRecurrence] = useState<Recurrence>('daily')
  const [automateTime, setAutomateTime] = useState('09:00')
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [seriesName, setSeriesName] = useState('')
  const [savingBusy, setSavingBusy] = useState(false)
  const [schedulingBusy, setSchedulingBusy] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  async function loadData() {
    // mode démo : pas de session côté serveur, l'API répondrait 401
    if (isDemoBrowser()) return
    const [tRes, aRes, sRes] = await Promise.all([
      fetch(`/api/social/templates?ws=${ws.slug}`),
      fetch(`/api/social/accounts?ws=${ws.slug}`),
      fetch(`/api/social/series?ws=${ws.slug}`),
    ])
    if (tRes.ok) { const { templates: list } = await tRes.json() as { templates: SocialTemplate[] }; setTemplates(list) }
    if (aRes.ok) { const { accounts: list } = await aRes.json() as { accounts: SocialAccount[] }; setAccounts(list) }
    if (sRes.ok) { const { series: list } = await sRes.json() as { series: SocialSeries[] }; setSeries(list) }
  }

  useEffect(() => { void loadData() }, [ws.slug])

  async function createNewTemplate() {
    if (!newTypeName.trim()) return
    try {
      const res = await fetch('/api/social/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ws: ws.slug, name: newTypeName, description: newTypeDesc, type: 'custom', voiceOptions: [voice], sfx }),
      })
      if (!res.ok) throw new Error('Failed')
      const { template } = await res.json() as { template: SocialTemplate }
      setTemplates((t) => [...t, template])
      setSelectedTemplate(template)
      setShowNewType(false)
      setNewTypeName('')
      setNewTypeDesc('')
    } catch { toast.error(t('common.error')) }
  }

  function sendToStudio() {
    if (!selectedTemplate || brief.trim().length < 5) { toast.error('Décrivez la vidéo (5 caractères minimum).'); return }
    toast.success(t('soc.prep.sent'))
    const encodedBrief = encodeURIComponent(`[Template : ${selectedTemplate.name}] Voix : ${voice}, Bruitages : ${sfx ? 'oui' : 'non'}.\n\n${brief}`)
    router.push(`/app/${ws.slug}/motion?brief=${encodedBrief}`)
  }

  async function scheduleForNoon() {
    if (!selectedTemplate) return
    if (accounts.length === 0) { toast.error('Connectez au moins un réseau pour programmer.'); return }
    setSchedulingBusy(true)
    try {
      const noon = new Date()
      noon.setHours(12, 0, 0, 0)
      if (noon <= new Date()) noon.setDate(noon.getDate() + 1)

      const allAccounts = accounts.map((a) => a.id)
      const platforms = accounts.map((a) => a.platform)

      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ws: ws.slug,
          title: `Cours Kalimat : ${brief || selectedTemplate.name}`,
          caption: brief || `Nouveau cours Kalimat avec le template "${selectedTemplate.name}"`,
          mediaUrls: selectedTemplate.demo_video_url ? [selectedTemplate.demo_video_url] : [],
          platforms,
          accountIds: allAccounts,
          scheduledAt: noon.toISOString(),
          templateId: selectedTemplate.id,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(`Post programmé pour ${noon.getHours()}h00 le ${noon.toLocaleDateString('fr-FR')}.`)
      router.push(`/app/${ws.slug}/social/calendar`)
    } catch { toast.error(t('common.error')) } finally { setSchedulingBusy(false) }
  }

  async function activateSeries() {
    if (!selectedAccounts.size) { toast.error(t('soc.pub.needNetwork')); return }
    if (!seriesName.trim()) { toast.error('Donnez un nom à cette série.'); return }
    setSavingBusy(true)
    try {
      const accountIds = Array.from(selectedAccounts)
      const platforms = accountIds.map((id) => accounts.find((a) => a.id === id)?.platform).filter(Boolean) as Platform[]
      const res = await fetch('/api/social/series', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ws: ws.slug, name: seriesName, templateId: selectedTemplate?.id ?? null, accountIds, platforms, recurrence, timeOfDay: automateTime }),
      })
      if (!res.ok) throw new Error('Failed')
      const { series: newSeries } = await res.json() as { series: SocialSeries }
      setSeries((s) => [...s, newSeries])
      toast.success('Série activée.')
      setAutomate(false)
    } catch { toast.error(t('common.error')) } finally { setSavingBusy(false) }
  }

  async function toggleSeries(s: SocialSeries) {
    await fetch(`/api/social/series?id=${s.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    setSeries((list) => list.map((x) => x.id === s.id ? { ...x, is_active: !x.is_active } : x))
  }

  const suggestions = selectedTemplate?.prompt_template?.next ?? DEFAULT_SUGGESTIONS
  const canStep2 = !!selectedTemplate
  const canStep3 = brief.trim().length >= 5

  const StepIndicator = ({ n, label }: { n: Step; label: string }) => (
    <div className={cn('flex items-center gap-2 text-[13px]', step >= n ? 'text-text' : 'text-text-3')}>
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', step > n ? 'bg-success text-accent-text' : step === n ? 'bg-accent text-accent-text' : 'bg-surface-3 text-text-3')}>
        {step > n ? <CheckCircle className="size-3.5" /> : n}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  )

  const STEP_LABELS = [t('soc.prep.step1'), t('soc.prep.step2'), t('soc.prep.step3'), t('soc.prep.step4'), t('soc.prep.step5')]

  return (
    <div className="mx-auto max-w-3xl p-4 pb-6 md:p-6">
      <PageHeader icon={<Clapperboard className="size-4" />} title={t('soc.prep.title')} subtitle={t('soc.prep.sub')} />

      {/* Steps — dots on mobile, labels on desktop */}
      <div className="mb-6">
        <div className="flex items-center gap-0">
          {([1, 2, 3, 4, 5] as Step[]).map((n, i) => (
            <div key={n} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors', step > n ? 'bg-success text-accent-text' : step === n ? 'bg-accent text-accent-text' : 'bg-surface-3 text-text-3')}>
                  {step > n ? <CheckCircle className="size-3.5" /> : n}
                </span>
                <span className={cn('hidden text-[11px] sm:block', step >= n ? 'text-text-2' : 'text-text-3')}>{STEP_LABELS[i]}</span>
              </div>
              {i < 4 && <div className={cn('mx-1 h-px flex-1', step > n ? 'bg-success' : 'bg-border')} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Template */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-text-2">{t('soc.prep.templatePick')}</p>
          {templates.length === 0 && (
            <Card><EmptyState title="Aucun template" hint="Chargement…" /></Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => { setSelectedTemplate(tpl); setVoice(tpl.voice_options[0] as VoiceOption ?? 'ar+fr'); setSfx(tpl.sfx) }}
                className={cn('flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:border-accent', selectedTemplate?.id === tpl.id ? 'border-accent bg-accent-soft' : 'border-border bg-surface')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-text">{tpl.name}</p>
                    {tpl.description && <p className="mt-0.5 text-[13px] text-text-2">{tpl.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {tpl.is_demo && <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-3">Démo</span>}
                  </div>
                </div>

                {tpl.demo_video_url && (
                  <div className="relative overflow-hidden rounded-lg bg-surface-3">
                    <video
                      src={tpl.demo_video_url}
                      className="h-40 w-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                      onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                      onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex size-8 items-center justify-center rounded-full bg-bg/80 text-text">
                        <Play className="size-4 translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1 text-[11px] text-text-3">
                  {tpl.voice_options.map((v) => <span key={v} className="rounded border border-border px-1.5 py-0.5">{v}</span>)}
                  {tpl.sfx && <span className="rounded border border-border px-1.5 py-0.5">bruitage</span>}
                  {tpl.duration_sec && <span className="rounded border border-border px-1.5 py-0.5">{tpl.duration_sec}s</span>}
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowNewType(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-text-3 transition-colors hover:border-accent hover:text-text-2"
            >
              <Clapperboard className="size-5" />
              <span className="text-sm font-medium">{t('soc.prep.templateNew')}</span>
            </button>
          </div>

          {selectedTemplate && accounts.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
              <div>
                <p className="text-sm font-medium text-accent-ink">Template sélectionné : {selectedTemplate.name}</p>
                <p className="text-[12px] text-text-2">Programmer directement avec la vidéo démo</p>
              </div>
              <Button size="sm" variant="outline" onClick={scheduleForNoon} loading={schedulingBusy}>
                <CalendarClock className="size-3.5" />Programmer à midi
              </Button>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="primary" disabled={!canStep2} onClick={() => setStep(2)}>
              Suivant <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Brief */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedTemplate?.prompt_template?.format && (
            <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-[13px] text-text-2">
              <span className="font-medium text-text">Format : </span>{selectedTemplate.prompt_template.format}
            </div>
          )}
          <Card className="p-5">
            <Field label={t('soc.prep.briefLabel')} hint={`${brief.trim().length} / 5+`}>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={t('soc.prep.briefPh')}
                className="min-h-36"
                autoFocus
              />
            </Field>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Retour</Button>
            <Button variant="primary" disabled={!canStep3} onClick={() => setStep(3)}>Suivant <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 3: Voice + SFX */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <div>
              <p className="mb-2 text-sm font-medium text-text"><Volume2 className="mr-1.5 inline size-4 text-text-3" />{t('soc.prep.voiceLabel')}</p>
              <div className="flex flex-wrap gap-2">
                {VOICE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setVoice(opt.value)}
                    className={cn('rounded-lg border px-4 py-2 text-sm transition-colors', voice === opt.value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong')}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">{t('soc.prep.sfxLabel')}</span>
              <Switch checked={sfx} onChange={setSfx} label={sfx ? t('soc.prep.sfxOn') : t('soc.prep.sfxOff')} />
            </div>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
            <Button variant="primary" onClick={() => setStep(4)}>Suivant <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 4: Send to studio */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-medium text-text">Résumé</h3>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-text-3">Template</dt><dd className="font-medium text-text">{selectedTemplate?.name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-text-3">Voix</dt><dd className="font-medium text-text">{VOICE_OPTIONS.find((v) => v.value === voice)?.label}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-text-3">Bruitages</dt><dd className="font-medium text-text">{sfx ? 'Oui' : 'Non'}</dd></div>
              <div className="flex gap-3"><dt className="shrink-0 text-text-3">Description</dt><dd className="text-right font-medium text-text">{brief.slice(0, 80)}{brief.length > 80 ? '…' : ''}</dd></div>
            </dl>
          </Card>

          <Card className="p-5 space-y-3">
            <p className="text-[13px] text-text-2">Ouvrez la page Motion Design avec ce brief pré-rempli. Une fois la vidéo créée, revenez pour valider et programmer.</p>
            <Button variant="primary" size="lg" className="w-full justify-center" onClick={sendToStudio}>
              <Clapperboard className="size-4" />{t('soc.prep.sendStudio')}
            </Button>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>Retour</Button>
            <Button variant="outline" onClick={() => setStep(5)}>Passer à la validation <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 5: Validate + automate */}
      {step === 5 && (
        <div className="space-y-4">
          {suggestions.length > 0 && (
            <Card className="p-5 space-y-3">
              <div>
                <h3 className="font-medium text-text">{t('soc.prep.nextSuggestions')}</h3>
                {selectedTemplate?.prompt_template?.series && (
                  <p className="text-[12px] text-text-3">Série : {selectedTemplate.prompt_template.series}</p>
                )}
              </div>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex-1 rounded-lg border border-border px-3 py-2 text-[13px] text-text">{s}</span>
                    <Button size="sm" variant="outline" onClick={() => { setBrief(s); setStep(2); toast.info('Brief pré-rempli.') }}>{t('soc.prep.acceptSuggestion')}</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Automation */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text">{t('soc.prep.automate')}</p>
                <p className="text-[13px] text-text-3">{t('soc.prep.automateHint')}</p>
              </div>
              <Switch checked={automate} onChange={setAutomate} label={t('soc.prep.automate')} />
            </div>

            {automate && (
              <div className="space-y-4 border-t border-border pt-4">
                <Field label="Nom de la série">
                  <Input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder={`Série ${selectedTemplate?.name ?? 'Social'}`} />
                </Field>
                <div>
                  <p className="mb-2 text-sm font-medium text-text"><Repeat className="mr-1.5 inline size-4 text-text-3" />Fréquence</p>
                  <div className="flex flex-wrap gap-2">
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => setRecurrence(opt.value)}
                        className={cn('rounded-lg border px-4 py-2 text-sm transition-colors', recurrence === opt.value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong')}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label={t('soc.prep.automateTime')}>
                  <Input type="time" value={automateTime} onChange={(e) => setAutomateTime(e.target.value)} />
                </Field>

                <div>
                  <p className="mb-2 text-sm font-medium text-text"><Settings className="mr-1.5 inline size-4 text-text-3" />{t('soc.prep.automateNetworks')}</p>
                  {accounts.length === 0 ? (
                    <p className="text-[13px] text-text-3">Aucun réseau connecté. <a href={`/app/${ws.slug}/social/accounts`} className="text-accent underline">Connecter un réseau</a></p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {accounts.map((acc) => {
                        const on = selectedAccounts.has(acc.id)
                        return (
                          <button key={acc.id} onClick={() => setSelectedAccounts((s) => { const n = new Set(s); on ? n.delete(acc.id) : n.add(acc.id); return n })}
                            className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong')}>
                            <PlatformIcon platform={acc.platform} className="size-3.5" color={on ? 'currentColor' : PLATFORM_COLORS[acc.platform]} />
                            {PLATFORM_LABELS[acc.platform]}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-surface-2/60 p-3 space-y-1.5 text-[13px] text-text-2">
                  <p className="font-medium text-text">Notifications</p>
                  <p>· {t('soc.prep.notif5min')}</p>
                  <p>· {t('soc.prep.notifPosting')}</p>
                  <p>· {t('soc.prep.notifDone')}</p>
                </div>

                <Button variant="primary" size="lg" className="w-full justify-center" onClick={activateSeries} loading={savingBusy} disabled={!selectedAccounts.size || !seriesName.trim()}>
                  {t('soc.prep.automateStart')}
                </Button>
              </div>
            )}
          </Card>

          {series.length > 0 && (
            <Card className="p-5 space-y-3">
              <h3 className="font-medium text-text">Séries actives</h3>
              <ul className="space-y-2">
                {series.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{s.name}</p>
                      <p className="text-[12px] text-text-3">
                        {RECURRENCE_OPTIONS.find((r) => r.value === s.recurrence)?.label} à {s.time_of_day.slice(0, 5)}
                        {s.next_at && ` · prochain : ${new Date(s.next_at).toLocaleDateString('fr-FR')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', s.is_active ? 'bg-success/15 text-success' : 'bg-surface-3 text-text-3')}>
                        {s.is_active ? 'Active' : 'En pause'}
                      </span>
                      <Button size="xs" variant="outline" onClick={() => toggleSeries(s)}>
                        {s.is_active ? t('soc.prep.automatePause') : t('soc.prep.automateResume')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(4)}>Retour</Button>
            <Button variant="primary" onClick={() => { setStep(1); setBrief(''); setSelectedTemplate(null) }}>
              Nouveau post <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showNewType} onClose={() => setShowNewType(false)} title={t('soc.prep.templateNew')}
        footer={<><Button onClick={() => setShowNewType(false)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!newTypeName.trim()} onClick={createNewTemplate}>Créer</Button></>}>
        <div className="space-y-4">
          <Field label={t('soc.prep.templateNewName')}><Input autoFocus value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Ex. Expression du jour" /></Field>
          <Field label={t('soc.prep.templateNewDesc')}><Textarea value={newTypeDesc} onChange={(e) => setNewTypeDesc(e.target.value)} placeholder="Décrivez ce type de vidéo…" /></Field>
        </div>
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><PreparePage /></Suspense> }
