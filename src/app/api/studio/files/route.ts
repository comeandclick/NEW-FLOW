import { promises as fs } from 'node:fs'
import path from 'node:path'
import { filePath, verifyPath } from '@/lib/studio/server/db'
import { json } from '@/lib/studio/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Stockage de fichiers du mode développement (STUDIO_STORE=file) : liens signés, comme Supabase Storage. */
const check = (req: Request) => {
  if (process.env.STUDIO_STORE !== 'file') return null
  const q = new URL(req.url).searchParams
  const p = q.get('path') ?? '', exp = Number(q.get('exp')), sig = q.get('sig') ?? ''
  return verifyPath(p, exp, sig) ? p : null
}
export async function PUT(req: Request) {
  const p = check(req); if (!p) return json({ error: 'forbidden' }, 403)
  const full = filePath(p)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, Buffer.from(await req.arrayBuffer()))
  return json({ ok: true })
}
export async function GET(req: Request) {
  const p = check(req); if (!p) return json({ error: 'forbidden' }, 403)
  try {
    const buf = await fs.readFile(filePath(p))
    return new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `inline; filename="${path.basename(p)}"`, 'Cache-Control': 'private, max-age=60' } })
  } catch { return json({ error: 'not_found' }, 404) }
}
