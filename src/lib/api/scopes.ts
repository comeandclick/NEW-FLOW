/** API scopes. Dependency-free: used by the settings UI, the key routes and the v1 handler. */
export const RESOURCES = ['tasks', 'projects', 'notes', 'events', 'goals', 'crm', 'messages', 'files', 'captures'] as const
export type ApiResource = (typeof RESOURCES)[number]

export const ALL_SCOPES: string[] = [...RESOURCES.flatMap((r) => [`${r}:read`, `${r}:write`]), 'notifications:write']

export const PRESETS: Record<'read' | 'agent' | 'full', string[]> = {
  read: RESOURCES.map((r) => `${r}:read`),
  agent: ALL_SCOPES.filter((s) => !s.startsWith('crm:')),
  full: ALL_SCOPES,
}

export type StoredKey = {
  id: string
  name: string
  prefix: string
  hash: string
  scopes: string[]
  bot_id: string
  created_by: string
  created_at: string
  expires_at: string | null
}

export const KEY_PREFIX = 'flw_'
export const MAX_KEYS = 20

export function validScopes(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const out = Array.from(new Set(input.filter((s): s is string => typeof s === 'string')))
  return out.length && out.every((s) => ALL_SCOPES.includes(s)) ? out : null
}
