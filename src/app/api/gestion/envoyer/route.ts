import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

/**
 * Envoie un devis / une facture / un ordre de mission au client par e-mail (15/10/2026) : message, PDF joint, lien de signature.
 * Besoin de RESEND_API_KEY (et MAIL_FROM). Sans elle : 501, et l'app ouvre la messagerie de l'appareil à la place.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 501 })
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (rateLimited(`envoi:${user.id}`, 10)) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  let b: { wsId?: string; docId?: string; to?: string; message?: string; pdf?: string }
  try { b = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  const to = String(b.to ?? '').trim()
  if (!b.wsId || !b.docId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || (b.pdf && b.pdf.length > 4_000_000)) return NextResponse.json({ ok: false }, { status: 400 })
  // lecture avec les droits de l'utilisateur : il ne peut envoyer qu'un document de son espace
  const { data: m } = await db.from('workspace_members').select('role').eq('workspace_id', b.wsId).eq('user_id', user.id).maybeSingle()
  if (!m || m.role === 'viewer') return NextResponse.json({ ok: false }, { status: 403 })
  const { data: d } = await db.from('gestion_documents').select('kind, number, public_token, total_ttc').eq('id', b.docId).eq('workspace_id', b.wsId).maybeSingle()
  if (!d) return NextResponse.json({ ok: false }, { status: 404 })
  const { data: ws } = await db.from('workspaces').select('name, settings').eq('id', b.wsId).maybeSingle()
  const ent = ((ws?.settings ?? {}) as { entreprise?: { nom?: string; email?: string } }).entreprise ?? {}
  const nomEnt = ent.nom ?? ws?.name ?? 'Flow'
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const lien = `${base}/s/${d.public_token}`
  const titre = d.kind === 'intervention' ? 'Ordre de mission' : d.kind === 'facture' ? 'Facture' : 'Devis'
  const msg = String(b.message ?? '').slice(0, 3000)
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">${msg.split('\n').map((l) => `<p style="margin:0 0 8px">${esc(l) || '&nbsp;'}</p>`).join('')}<p style="margin:20px 0"><a href="${esc(lien)}" style="display:inline-block;background:#111;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none">${d.kind === 'devis' ? 'Lire et signer le devis' : `Voir ${titre.toLowerCase()}`}</a></p><p style="color:#888;font-size:12px">${esc(nomEnt)}</p></div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? `${nomEnt} <onboarding@resend.dev>`, to, reply_to: ent.email || undefined, subject: `${titre} ${d.number} · ${nomEnt}`, html, text: `${msg}\n\n${lien}`,
      attachments: b.pdf ? [{ filename: `${titre.replace(/\s/g, '-')}-${d.number}.pdf`, content: b.pdf }] : undefined }),
  }).catch(() => null)
  if (!r?.ok) return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
