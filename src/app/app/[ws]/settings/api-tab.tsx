'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { PRESETS, RESOURCES, type StoredKey } from '@/lib/api/scopes'
import { ALERT_TYPES, routesFrom, type AlertRoutes, type AlertType } from '@/lib/api/alert-types'

type Preset = keyof typeof PRESETS | 'custom'

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="mb-6 rounded-2xl border border-border bg-surface p-5"><h2 className="text-sm font-semibold">{title}</h2>{hint && <p className="mt-0.5 text-[13px] text-text-3">{hint}</p>}<div className="mt-4 space-y-4">{children}</div></section>
}

function CopyBox({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border bg-surface-2 p-3 pr-12 font-mono text-[12px] leading-relaxed text-text-2" aria-label={label}>{value}</pre>
      <button type="button" aria-label={t('api.copy')} onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg border border-border bg-surface text-text-2 hover:bg-surface-3">
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

export function ApiTab() {
  const { t, locale } = useI18n()
  const { ws, isAdmin } = useWorkspace()
  const { isDemo } = useSession()
  const [keys, setKeys] = useState<StoredKey[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<Preset>('agent')
  const [scopes, setScopes] = useState<string[]>(PRESETS.agent)
  const [days, setDays] = useState('0')
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<StoredKey | null>(null)
  const [routes, setRoutes] = useState<AlertRoutes>(() => routesFrom(null))
  const [savingRoutes, setSavingRoutes] = useState(false)
  const [origin, setOrigin] = useState('https://new-flow-dashboard.vercel.app')

  const load = useCallback(async () => {
    const { data } = await getDb().from('workspaces').select('settings').eq('id', ws.id).single()
    const st = (data as { settings?: { api_keys?: StoredKey[] } } | null)?.settings
    setKeys(st?.api_keys ?? [])
    setRoutes(routesFrom(st))
  }, [ws.id])
  useEffect(() => { setOrigin(window.location.origin); if (!isDemo && isAdmin) void load() }, [load, isDemo, isAdmin])

  if (isDemo) return <Block title={t('api.title')}><p className="text-sm text-text-2">{t('api.demo')}</p></Block>
  if (!isAdmin) return <Block title={t('api.title')}><p className="text-sm text-text-2">{t('api.adminOnly')}</p></Block>

  const pick = (p: Preset) => { setPreset(p); if (p !== 'custom') setScopes(PRESETS[p]) }
  const toggle = (s: string) => { setPreset('custom'); setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])) }

  async function create() {
    setBusy(true)
    try {
      const r = await fetch('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: ws.id, name, scopes, expiresInDays: Number(days) || null }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setOpen(false); setName(''); setSecret(j.key); void load()
    } catch { toast.error(t('api.err')) } finally { setBusy(false) }
  }
  const setRoute = (t: AlertType, patch: Partial<AlertRoutes[AlertType]>) => setRoutes((cur) => ({ ...cur, [t]: { ...cur[t], ...patch } }))
  async function saveRoutes() {
    setSavingRoutes(true)
    const r = await fetch('/api/keys', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: ws.id, routes }) })
    setSavingRoutes(false)
    if (r.ok) toast.success(t('common.saved')); else toast.error(t('common.error'))
  }
  async function testRoute(type: AlertType) {
    const r = await fetch('/api/keys', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: ws.id, type }) })
    if (r.ok) toast.success(t('api.alerts.sent')); else toast.error(r.status === 409 ? t('api.alerts.needKey') : t('common.error'))
  }
  async function revoke() {
    if (!revoking) return
    await fetch('/api/keys', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: ws.id, keyId: revoking.id }) })
    setRevoking(null); void load()
  }

  const base = `${origin}/api/v1`
  const example = `curl ${base}/tasks?status=todo \\\n  -H "Authorization: Bearer $FLOW_API_KEY"\n\ncurl -X PATCH ${base}/tasks/<id> \\\n  -H "Authorization: Bearer $FLOW_API_KEY" -H "content-type: application/json" \\\n  -d '{"status":"done"}'\n\ncurl -X POST ${base}/messages \\\n  -H "Authorization: Bearer $FLOW_API_KEY" -H "content-type: application/json" \\\n  -d '{"channel":"general","text":"Build terminé ✅"}'`
  const snippet = locale === 'fr'
    ? `## Flow (gestion de projet)\nL'API Flow est la source de vérité des tâches de ce projet.\n- Base : ${base} ; clé dans la variable d'environnement FLOW_API_KEY (en-tête « Authorization: Bearer $FLOW_API_KEY »). Ne jamais écrire la clé dans le code ni dans git.\n- Avant de travailler : GET /tasks?status=todo et /tasks?status=in_progress, prendre la tâche la plus prioritaire.\n- Au démarrage d'une tâche : PATCH /tasks/{id} {"status":"in_progress"}. Une fois terminée et vérifiée : {"status":"done"}.\n- Nouvelles idées ou tâches repérées : POST /tasks {"title","description","priority","project_id"}.\n- Décisions et comptes rendus : POST /notes {"title","markdown"}. Fichiers produits : POST /files.\n- Pour me prévenir : POST /messages {"channel":"general","text":"…"} ou POST /notifications {"title","body"}.\n- Les suppressions vont à la corbeille. Ne supprime rien sans demande explicite.\n- Référence complète : GET ${base}`
    : `## Flow (project management)\nThe Flow API is the source of truth for this project's tasks.\n- Base: ${base} — key in the FLOW_API_KEY environment variable (header "Authorization: Bearer $FLOW_API_KEY"). Never put the key in code or git.\n- Before working: GET /tasks?status=todo and /tasks?status=in_progress, take the highest-priority task.\n- When starting a task: PATCH /tasks/{id} {"status":"in_progress"}. When finished and verified: {"status":"done"}.\n- New ideas or tasks you spot: POST /tasks {"title","description","priority","project_id"}.\n- Decisions and reports: POST /notes {"title","markdown"}. Produced files: POST /files.\n- To notify me: POST /messages {"channel":"general","text":"…"} or POST /notifications {"title","body"}.\n- Deletions go to the Trash. Delete nothing without an explicit request.\n- Full reference: GET ${base}`

  return (
    <>
      <Block title={t('api.title')} hint={t('api.hint')}>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {keys.length === 0 && <li className="px-4 py-6 text-center text-sm text-text-3">{t('api.none')}</li>}
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="size-4 shrink-0 text-text-3" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{k.name}</div>
                <div className="truncate font-mono text-xs text-text-3">{k.prefix}…</div>
                <div className="mt-1 flex flex-wrap gap-1"><Badge>{k.scopes.length} {t('api.perms')}</Badge>{k.expires_at && <Badge>{t('api.expires')} {new Date(k.expires_at).toLocaleDateString(locale)}</Badge>}</div>
              </div>
              <Button variant="danger" size="sm" onClick={() => setRevoking(k)} aria-label={`${t('api.revoke')} ${k.name}`}><Trash2 className="size-4" /><span className="hidden sm:inline">{t('api.revoke')}</span></Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />{t('api.create')}</Button></div>
      </Block>

      <Block title={t('api.alerts.title')} hint={t('api.alerts.hint')}>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {ALERT_TYPES.map((type) => (
            <li key={type} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_180px_auto_auto] sm:items-center">
              <div className="min-w-0">
                <div className="text-sm font-medium">{t(`api.alert.${type}` as 'api.alert.info')}</div>
                <div className="text-xs text-text-3">{t(`api.alert.${type}.hint` as 'api.alert.info.hint')}</div>
              </div>
              <label className="flex items-center gap-1.5 text-sm"><span className="text-text-3" aria-hidden>#</span>
                <Input aria-label={`${t('api.alerts.channel')} – ${t(`api.alert.${type}` as 'api.alert.info')}`} value={routes[type].channel} maxLength={40} disabled={!routes[type].enabled} onChange={(e) => setRoute(type, { channel: e.target.value })} />
              </label>
              <div className="flex items-center gap-4 text-[13px] text-text-2">
                <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={routes[type].enabled} onChange={(e) => setRoute(type, { enabled: e.target.checked })} />{t('api.alerts.on')}</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={routes[type].notify} disabled={!routes[type].enabled} onChange={(e) => setRoute(type, { notify: e.target.checked })} />{t('api.alerts.push')}</label>
              </div>
              <Button size="sm" disabled={!routes[type].enabled} onClick={() => testRoute(type)}>{t('api.alerts.test')}</Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end"><Button variant="primary" loading={savingRoutes} onClick={saveRoutes}>{t('common.save')}</Button></div>
      </Block>

      <Block title={t('api.use.title')} hint={t('api.use.hint')}>
        <Field label={t('api.use.base')}><CopyBox value={base} /></Field>
        <CopyBox value={example} />
        <Field label={t('api.use.snippet')}><CopyBox value={snippet} /></Field>
        <p className="text-xs text-text-3">{t('api.use.limits')}</p>
      </Block>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('api.create')}
        footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={!name.trim() || !scopes.length} onClick={create}>{t('api.create')}</Button></>}>
        <div className="space-y-4">
          <Field label={t('api.name')}><Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('api.namePh')} /></Field>
          <Field label={t('api.preset')}>
            <Select value={preset} onChange={(e) => pick(e.target.value as Preset)}>
              <option value="read">{t('api.preset.read')}</option><option value="agent">{t('api.preset.agent')}</option><option value="full">{t('api.preset.full')}</option><option value="custom">{t('api.preset.custom')}</option>
            </Select>
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-text-2">{t('api.scopes')}</legend>
            <div className="overflow-hidden rounded-xl border border-border">
              {[...RESOURCES, 'notifications' as const].map((r) => (
                <div key={r} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
                  <span className="text-sm">{t(`api.res.${r}` as 'api.res.tasks')}</span>
                  <span className="flex gap-4">
                    {r !== 'notifications' && <label className="flex items-center gap-1.5 text-[13px] text-text-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={scopes.includes(`${r}:read`)} onChange={() => toggle(`${r}:read`)} />{t('api.read')}</label>}
                    <label className="flex items-center gap-1.5 text-[13px] text-text-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={scopes.includes(`${r}:write`)} onChange={() => toggle(`${r}:write`)} />{t('api.write')}</label>
                  </span>
                </div>
              ))}
            </div>
          </fieldset>
          <Field label={t('api.expiry')}>
            <Select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="0">{t('api.exp.never')}</option><option value="30">{t('api.exp.30')}</option><option value="90">{t('api.exp.90')}</option><option value="365">{t('api.exp.365')}</option>
            </Select>
          </Field>
        </div>
      </Dialog>

      <Dialog open={!!secret} onClose={() => setSecret(null)} title={t('api.created')} size="sm" footer={<Button variant="primary" onClick={() => setSecret(null)}>OK</Button>}>
        <p className="mb-3 text-sm text-text-2">{t('api.copyOnce')}</p>
        {secret && <CopyBox value={secret} />}
      </Dialog>

      <Dialog open={!!revoking} onClose={() => setRevoking(null)} title={t('api.revoke')} size="sm" footer={<><Button onClick={() => setRevoking(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={revoke}>{t('api.revoke')}</Button></>}>
        <p className="text-sm text-text-2">{t('api.revokeConfirm')}</p>
      </Dialog>
    </>
  )
}
