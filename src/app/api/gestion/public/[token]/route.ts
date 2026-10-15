import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/api/notify'
import { rateLimited } from '@/lib/security'

export const runtime = 'nodejs'

/**
 * Devis / ordre de mission ouvert par le client avec son lien secret (/s/<jeton>), sans compte Flow (15/10/2026).
 * GET : le document, l'entreprise et le client. POST : signer (accepter) ou refuser, une seule fois.
 * Tout passe ici avec la clé de service, et seulement pour le document de ce jeton.
 */
const NO_STORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' }
const non = (s = 404) => NextResponse.json({ error: 'not_found' }, { status: s, headers: NO_STORE })
const valide = (t: string) => /^[a-f0-9]{36}$/.test(t)

async function docDe(token: string) {
  if (!valide(token)) return null
  const admin = getAdminDb()
  const { data } = await admin.from('gestion_documents').select('*').eq('public_token', token).is('deleted_at', null).maybeSingle()
  return data ? { admin, d: data as Record<string, any> } : null // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await docDe((await params).token)
  if (!ctx || !['devis', 'facture', 'intervention'].includes(ctx.d.kind)) return non()
  const { admin, d } = ctx
  const [ws, client] = await Promise.all([
    admin.from('workspaces').select('name, logo_url, settings').eq('id', d.workspace_id).maybeSingle(),
    d.contact_id ? admin.from('crm_contacts').select('name, company, address, zip, city, email, phone, siret').eq('id', d.contact_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const s = (ws.data?.settings ?? {}) as { entreprise?: Record<string, unknown> }
  // on ne renvoie jamais les notes internes, les membres ni les liens internes
  const champs = ['kind', 'number', 'title', 'status', 'intervention_type', 'issued_at', 'due_at', 'start_at', 'end_at', 'address', 'lines', 'discount', 'total_ht', 'total_tva', 'total_ttc', 'travaux', 'signer_name', 'signature', 'signed_at', 'closed_at', 'priority', 'ref_externe']
  const doc = Object.fromEntries(champs.map((k) => [k, d[k] ?? null]))
  return NextResponse.json({ doc, entreprise: { ...(s.entreprise ?? {}), nom: s.entreprise?.nom ?? ws.data?.name }, logo: ws.data?.logo_url ?? null, client: client.data ?? null }, { headers: NO_STORE })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'ip'
  if (rateLimited(`signature:${ip}`, 10)) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  const ctx = await docDe(token)
  if (!ctx) return non()
  const { admin, d } = ctx
  let body: { action?: string; nom?: string; signature?: string; motif?: string }
  try { body = await req.json() } catch { return non(400) }
  const nom = String(body.nom ?? '').trim().slice(0, 120)
  if (!nom) return NextResponse.json({ error: 'nom' }, { status: 400, headers: NO_STORE })
  const devisOuvert = d.kind === 'devis' && !['accepte', 'refuse'].includes(d.status)
  const interOuverte = d.kind === 'intervention' && !d.signature
  if (!devisOuvert && !interOuverte) return NextResponse.json({ error: 'deja' }, { status: 409, headers: NO_STORE })
  const now = new Date().toISOString()
  let patch: Record<string, unknown>
  if (body.action === 'refuser' && d.kind === 'devis') {
    patch = { status: 'refuse', signer_name: nom, decided_at: now, signed_via: 'lien', notes: [d.notes, body.motif ? `Motif du refus (client) : ${String(body.motif).slice(0, 500)}` : ''].filter(Boolean).join('\n') || null }
  } else if (body.action === 'signer') {
    const sig = String(body.signature ?? '')
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400_000) return NextResponse.json({ error: 'signature' }, { status: 400, headers: NO_STORE })
    patch = { signature: sig, signer_name: nom, signed_at: now, signed_via: 'lien', ...(d.kind === 'devis' ? { status: 'accepte', decided_at: now } : {}) }
  } else return non(400)
  const { error } = await admin.from('gestion_documents').update(patch).eq('id', d.id)
  if (error) return NextResponse.json({ error: 'server' }, { status: 500, headers: NO_STORE })
  await admin.from('activity_logs').insert({ workspace_id: d.workspace_id, user_id: null, action: patch.status ? `status:${patch.status}` : 'signed', entity_type: 'gestion_documents', entity_id: d.id, meta: { number: d.number, par: nom, via: 'lien' } })
  const { data: ws } = await admin.from('workspaces').select('slug').eq('id', d.workspace_id).maybeSingle()
  const qui = [...new Set([d.created_by, ...(d.assigned_to ?? [])].filter(Boolean))] as string[]
  const quoi = d.kind === 'devis' ? (patch.status === 'accepte' ? 'accepté et signé' : 'refusé') : 'signé'
  await notifyUsers(d.workspace_id, qui, { type: 'gestion', title: `${d.kind === 'devis' ? 'Devis' : 'Ordre de mission'} ${d.number} ${quoi}`, body: `par ${nom}`, url: `/app/${ws?.slug ?? ''}/gestion/${d.kind === 'devis' ? 'devis' : 'interventions'}?id=${d.id}` }).catch(() => {})
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
