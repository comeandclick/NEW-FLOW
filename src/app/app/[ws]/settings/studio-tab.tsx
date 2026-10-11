'use client'
import { useState } from 'react'
import { ArrowRightLeft, CheckCircle2, Database, GitBranch, Triangle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { studioApi, usePoll, useStudioMode, type LiveJob } from '@/lib/studio/api'
import { buildMovePrompt, type MoveTarget } from '@/lib/studio/prompts'
import { ConnectPanel } from '@/components/studio/connect-panel'
import { Section } from './section'

const ACCOUNTS: { id: MoveTarget; icon: typeof GitBranch }[] = [{ id: 'vercel', icon: Triangle }, { id: 'github', icon: GitBranch }, { id: 'supabase', icon: Database }]

/** Paramètres > Studio : connexion du Mac, comptes (Vercel, GitHub, Supabase) et déplacement d'un site terminé vers ces comptes. */
export function StudioTab() {
  const { locale } = useI18n()
  const c = studioCopy(locale).accounts
  const { mode } = useStudioMode()
  const live = mode === 'live'
  const devs = usePoll(studioApi.devices, 5000, live)
  const jobs = usePoll(studioApi.jobs, 8000, live)
  const dev = (devs.data?.devices ?? []).find((d) => d.online) ?? devs.data?.devices?.[0]
  const state = (id: string) => dev?.setup?.components.find((x) => x.id === id)
  const sites = (jobs.data?.jobs ?? []).filter((j) => j.kind === 'site' && j.status === 'done')
  const [moving, setMoving] = useState<LiveJob | null>(null)
  const [targets, setTargets] = useState<MoveTarget[]>(['vercel', 'github', 'supabase'])
  const [busy, setBusy] = useState<string | null>(null)

  const connect = async (id: string) => {
    if (!dev) { toast.error(c.macOff); return }
    setBusy(id)
    try { await studioApi.setup(dev.id, { action: 'login', component: id }); toast.success(c.terminalOpened) } catch { toast.error('Erreur') } finally { setBusy(null) }
  }
  const move = async () => {
    if (!moving) return
    setBusy('move')
    try { await studioApi.message(moving.id, { text: buildMovePrompt(targets, moving.deliver?.url), mode: 'after' }); toast.success(c.moveSent); setMoving(null) } catch { toast.error('Erreur') } finally { setBusy(null) }
  }

  return (
    <>
      <div className="mb-6"><h2 className="mb-3 text-sm font-semibold">{c.macTitle}</h2><ConnectPanel live={live} /></div>
      {live && (
        <>
          <Section title={c.accountsTitle}>
            <ul className="divide-y divide-border">
              {ACCOUNTS.map(({ id, icon: I }) => {
                const st = state(id)
                const ok = st?.state === 'ok'
                return (
                  <li key={id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-2"><I className="size-4" /></span>
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{c[id]}</p>{ok && st?.version && <p className="truncate text-xs text-text-3">{st.version}</p>}</div>
                    {ok ? <Badge color="#15803d"><CheckCircle2 className="mr-1 inline size-3" />{c.connected}</Badge> : <><Badge>{c.notConnected}</Badge><Button size="sm" variant="outline" loading={busy === id} onClick={() => void connect(id)}>{c.connect}</Button></>}
                  </li>
                )
              })}
            </ul>
          </Section>
          <Section title={c.moveTitle}>
            {sites.length === 0 ? <p className="text-[13px] text-text-3">{c.moveEmpty}</p> : (
              <ul className="divide-y divide-border">
                {sites.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{j.title}</p>{j.deliver?.url && <p className="truncate text-xs text-text-3">{j.deliver.url}</p>}</div>
                    <Button size="sm" variant="outline" onClick={() => setMoving(j)}><ArrowRightLeft className="size-3.5" />{c.move}</Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Dialog open={!!moving} onClose={() => setMoving(null)} title={`${c.move} : ${moving?.title ?? ''}`} size="sm"
            footer={<><Button variant="outline" onClick={() => setMoving(null)}>{locale === 'en' ? 'Cancel' : 'Annuler'}</Button><Button variant="primary" loading={busy === 'move'} disabled={!targets.length} onClick={() => void move()}>{c.moveConfirm}</Button></>}>
            <p className="mb-3 text-[13px] text-text-3">{c.moveTo}</p>
            <ul className="space-y-2">
              {ACCOUNTS.map(({ id, icon: I }) => (
                <li key={id}><label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={targets.includes(id)} onChange={(e) => setTargets((t) => (e.target.checked ? [...t, id] : t.filter((x) => x !== id)))} />
                  <I className="size-4 text-text-2" /><span className="text-sm">{c[id]}</span>{state(id)?.state !== 'ok' && <Badge>{c.notConnected}</Badge>}
                </label></li>
              ))}
            </ul>
          </Dialog>
        </>
      )}
    </>
  )
}
