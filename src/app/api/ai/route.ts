import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'
import { OUTILS, versWidget } from '@/lib/ai-widgets'

export const runtime = 'nodejs'
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'

type Msg = { role: 'user' | 'assistant'; content: string }

const hits = new Map<string, number[]>()
/** Best-effort per-instance limiter (20 requests / minute / user). */
function limited(id: string) {
  const now = Date.now()
  const list = (hits.get(id) ?? []).filter((t) => now - t < 60_000)
  list.push(now); hits.set(id, list)
  return list.length > 20
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 501 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (limited(user.id)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: { messages?: Msg[]; context?: unknown; locale?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const messages = (body.messages ?? []).slice(-12).filter((m) => typeof m.content === 'string' && m.content.length < 4000)
  if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
  const system = `Tu es l'assistant de Flow, l'espace de travail de l'utilisateur (tâches, agenda, messages, clients, vidéos de l'Atelier). Nous sommes le ${aujourdhui}.
Réponds en ${body.locale === 'en' ? 'anglais' : 'français'}, chaleureux et bref (1 à 3 phrases).
Dès que la réponse se montre mieux qu'elle ne se dit, appelle un outil d'affichage : il remplace une longue liste par un widget propre.
Ex. « mes tâches du jour » → une phrase courte (« Voici tes tâches du jour : ») puis afficher_taches ; « quels clients attendent ? » → afficher_clients ;
« donne-moi le TikTok du cours comment dire je en arabe » → afficher_video avec recherche « comment dire je ». N'énumère pas toi-même ce que montre le widget.
Pour créer quelque chose, ajoute une ligne exacte <action>{"type":"create_task","title":"..."}</action> (ou create_note avec "body", create_event avec "at" en ISO-8601), seulement si l'utilisateur le demande.
Aperçu de l'espace (JSON) : ${JSON.stringify(body.context ?? {}).slice(0, 12000)}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages, tools: OUTILS, tool_choice: { type: 'auto' } }),
    })
    if (!r.ok) return NextResponse.json({ error: 'upstream', status: r.status }, { status: 502 })
    const data = await r.json()
    const blocs = (data.content ?? []) as { type: string; text?: string; name?: string; input?: Record<string, unknown> }[]
    const text = blocs.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    const widgets = blocs.filter((c) => c.type === 'tool_use').map((c) => versWidget(c.name ?? '', c.input ?? {})).filter(Boolean)
    return NextResponse.json({ text, widgets })
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 })
  }
}
