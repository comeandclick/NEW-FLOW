import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/api/notify'
import { CLIENT_BUCKET, clientFilePath, isValidToken, MAX_CLIENT_FILE_BYTES, MAX_CLIENT_MESSAGE, nextVersion, titleFromName, type ClientFile, type ClientRow, type PortalData } from '@/lib/clients'

export const runtime = 'nodejs'

/**
 * Espace client ouvert par un lien secret (/c/<jeton>). Le client n'a pas de compte Flow :
 * tout passe ici, avec la clé de service, et seulement pour le client de ce jeton.
 * GET : son espace (discussion, fichiers avec liens signés, liste à faire).
 * POST : écrire, valider ou demander une modification, envoyer un fichier (lien d'envoi signé puis enregistrement).
 */

const NO_STORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' }
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE })

async function clientOf(token: string) {
  if (!isValidToken(token)) return null
  const admin = getAdminDb()
  const { data } = await admin.from('clients').select('*').eq('access_token', token).is('deleted_at', null).maybeSingle()
  return data ? { admin, c: data as ClientRow } : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await clientOf((await params).token)
  if (!ctx) return notFound()
  const { admin, c } = ctx
  const [ws, msgs, files, todos] = await Promise.all([
    admin.from('workspaces').select('name').eq('id', c.workspace_id).maybeSingle(),
    admin.from('client_messages').select('*').eq('client_id', c.id).is('deleted_at', null).order('created_at', { ascending: true }).limit(500),
    admin.from('client_files').select('*').eq('client_id', c.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(300),
    admin.from('client_todos').select('*').eq('client_id', c.id).is('deleted_at', null).order('position', { ascending: true }).limit(300),
  ])
  const rows = (files.data ?? []) as ClientFile[]
  const paths = rows.map((f) => f.storage_path).filter((p) => !p.startsWith('/'))
  const signed = paths.length ? (await admin.storage.from(CLIENT_BUCKET).createSignedUrls(paths, 3600)).data ?? [] : []
  const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]))
  const data: PortalData = {
    client: { id: c.id, name: c.name, company: c.company, cadence: c.cadence, per_period: c.per_period, color: c.color, workspace_name: (ws.data as { name?: string } | null)?.name ?? null },
    // l'identifiant des membres de l'équipe ne sort pas : le nom affiché suffit
    messages: (msgs.data ?? []).map((m) => ({ ...m, author_id: null })),
    files: rows.map((f) => ({ ...f, uploaded_by: null, url: f.storage_path.startsWith('/') ? f.storage_path : urlOf.get(f.storage_path) ?? null })),
    todos: todos.data ?? [],
  }
  return NextResponse.json(data, { headers: NO_STORE })
}

type Body =
  | { action: 'message'; body: string }
  | { action: 'review'; file_id: string; status: 'validee' | 'modif'; note?: string }
  | { action: 'upload-url'; name: string; size: number }
  | { action: 'file'; path: string; name: string; size: number; mime?: string | null }

/** Prévient la personne qui a créé le client (ou, à défaut, les propriétaires de l'espace). */
async function tell(admin: ReturnType<typeof getAdminDb>, c: ClientRow, title: string, body?: string | null) {
  let ids = c.created_by ? [c.created_by] : []
  if (!ids.length) {
    const { data } = await admin.from('workspace_members').select('user_id').eq('workspace_id', c.workspace_id).in('role', ['owner', 'admin'])
    ids = (data ?? []).map((m) => m.user_id as string)
  }
  const { data: ws } = await admin.from('workspaces').select('slug').eq('id', c.workspace_id).maybeSingle()
  try { await notifyUsers(c.workspace_id, ids, { type: 'client', title, body, url: ws?.slug ? `/app/${ws.slug}/clients/${c.id}` : null }) } catch {}
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await clientOf((await params).token)
  if (!ctx) return notFound()
  const { admin, c } = ctx
  let b: Body
  try { b = await req.json() as Body } catch { return bad('json') }
  const base = { workspace_id: c.workspace_id, client_id: c.id }
  const now = new Date().toISOString()

  if (b.action === 'message') {
    const text = String(b.body ?? '').trim().slice(0, MAX_CLIENT_MESSAGE)
    if (!text) return bad('empty')
    const { error } = await admin.from('client_messages').insert({ ...base, author_kind: 'client', author_name: c.name, body: text })
    if (error) return bad('db')
    await tell(admin, c, `${c.name} vous a écrit`, text)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  if (b.action === 'review') {
    if (b.status !== 'validee' && b.status !== 'modif') return bad('status')
    const { data: f } = await admin.from('client_files').select('*').eq('id', String(b.file_id)).eq('client_id', c.id).is('deleted_at', null).maybeSingle()
    if (!f || (f as ClientFile).uploaded_by_kind !== 'team') return notFound()
    const note = String(b.note ?? '').trim().slice(0, MAX_CLIENT_MESSAGE)
    if (b.status === 'modif' && !note) return bad('empty')
    const { error } = await admin.from('client_files').update({ status: b.status, updated_at: now }).eq('id', (f as ClientFile).id)
    if (error) return bad('db')
    if (note) await admin.from('client_messages').insert({ ...base, author_kind: 'client', author_name: c.name, body: note, file_id: (f as ClientFile).id })
    const title = (f as ClientFile).title
    await tell(admin, c, b.status === 'validee' ? `${c.name} a validé « ${title} »` : `${c.name} demande une modification sur « ${title} »`, note || null)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  if (b.action === 'upload-url') {
    const size = Number(b.size)
    if (!b.name || !Number.isFinite(size) || size <= 0) return bad('file')
    if (size > MAX_CLIENT_FILE_BYTES) return bad('too_big')
    const path = clientFilePath(c.workspace_id, c.id, String(b.name))
    const { data, error } = await admin.storage.from(CLIENT_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return bad('storage')
    return NextResponse.json({ path: data.path, token: data.token }, { headers: NO_STORE })
  }

  if (b.action === 'file') {
    const path = String(b.path ?? '')
    // seulement un fichier envoyé dans le dossier de CE client
    if (!path.startsWith(`${c.workspace_id}/${c.id}/`) || path.includes('..')) return bad('path')
    const name = String(b.name ?? 'fichier').slice(0, 200)
    const folder = path.slice(0, path.lastIndexOf('/'))
    const { data: found } = await admin.storage.from(CLIENT_BUCKET).list(folder, { search: path.slice(folder.length + 1), limit: 1 })
    if (!found?.length) return bad('missing')
    const { data: existing } = await admin.from('client_files').select('title,version,deleted_at').eq('client_id', c.id)
    const title = titleFromName(name)
    const { error } = await admin.from('client_files').insert({
      ...base, title, name, mime_type: b.mime || null, size: Math.min(Number(b.size) || 0, MAX_CLIENT_FILE_BYTES), storage_path: path,
      version: nextVersion((existing ?? []) as ClientFile[], title), status: 'recu', uploaded_by_kind: 'client',
    })
    if (error) return bad('db')
    await tell(admin, c, `${c.name} a envoyé un fichier`, name)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  return bad('action')
}
