'use client'
import { isDemoBrowser } from '@/lib/demo/runtime'

/** Best-effort e-mail to workspace members (silently ignored in demo mode or when no mail provider is configured). */
export async function emailMembers(p: { workspaceId: string; userIds: string[]; subject: string; text?: string; when?: string; url?: string }) {
  if (isDemoBrowser() || !p.userIds.length) return
  try { await fetch('/api/mail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }) } catch { /* optional */ }
}
