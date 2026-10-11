/* Alert routing definitions. Dependency-free: shared by the settings UI and the server. */
/** Events an AI agent / script can report. Each one is routed to a channel (created on demand). */
export const ALERT_TYPES = ['task.done', 'group.done', 'step.done', 'security.alert', 'request', 'error', 'info'] as const
export type AlertType = (typeof ALERT_TYPES)[number]
export type Severity = 'info' | 'success' | 'warning' | 'critical'
export type Route = { enabled: boolean; channel: string; notify: boolean }
export type AlertRoutes = Record<AlertType, Route>

export const DEFAULT_ROUTES: AlertRoutes = {
  'task.done': { enabled: true, channel: 'avancement', notify: false },
  'group.done': { enabled: true, channel: 'avancement', notify: true },
  'step.done': { enabled: true, channel: 'avancement', notify: true },
  'security.alert': { enabled: true, channel: 'securite', notify: true },
  request: { enabled: true, channel: 'demandes', notify: true },
  error: { enabled: true, channel: 'alertes', notify: true },
  info: { enabled: true, channel: 'general', notify: false },
}

export function routesFrom(settings: unknown): AlertRoutes {
  const saved = ((settings as { api_alerts?: { routes?: Partial<AlertRoutes> } } | null)?.api_alerts?.routes) ?? {}
  const out = { ...DEFAULT_ROUTES }
  for (const t of ALERT_TYPES) {
    const r = saved[t]
    if (!r) continue
    out[t] = {
      enabled: r.enabled !== false,
      channel: typeof r.channel === 'string' && r.channel.trim() ? cleanChannel(r.channel) : DEFAULT_ROUTES[t].channel,
      notify: r.notify ?? DEFAULT_ROUTES[t].notify,
    }
  }
  return out
}

export const cleanChannel = (n: string) => n.replace(/^#/, '').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'general'

