import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

// Transcription d'un vocal par Groq Whisper (19/10/2026). Sert surtout à l'app iPhone, qui ne sait pas lire
// ni transcrire les anciens vocaux enregistrés en webm sur le site. Le fichier est lu avec la session de
// l'utilisateur : la RLS du stockage décide s'il y a accès.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const groq = process.env.GROQ_API_KEY
  if (!groq) return NextResponse.json({ error: 'no_key' }, { status: 501 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (rateLimited(`transcribe:${user.id}`, 10)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: { path?: string; locale?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const path = String(body.path ?? '')
  if (!path || path.length > 400 || path.includes('..')) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const { data: file, error } = await db.storage.from('voice').download(path)
  if (error || !file) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (file.size > 24 * 1024 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 })

  const form = new FormData()
  form.append('file', file, path.split('/').pop() || 'vocal.webm')
  form.append('model', process.env.GROQ_WHISPER_MODEL ?? 'whisper-large-v3-turbo')
  form.append('language', String(body.locale ?? 'fr').slice(0, 2))
  form.append('response_format', 'json')
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { authorization: `Bearer ${groq}` }, body: form,
  }).catch(() => null)
  if (!r) return NextResponse.json({ error: 'upstream' }, { status: 502 })
  if (r.status === 429) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (!r.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })
  const d = await r.json().catch(() => ({}))
  return NextResponse.json({ text: String(d.text ?? '').trim() })
}
