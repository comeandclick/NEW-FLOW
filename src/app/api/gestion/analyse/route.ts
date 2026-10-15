import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'
export const maxDuration = 60

// Lecture d'une facture (photo ou PDF rendu en images) par l'IA (15/10/2026).
// Claude si ANTHROPIC_API_KEY existe, sinon Groq (modèle qui voit les images). Réponse : un objet JSON propre.
const CONSIGNE = `Tu lis une facture, un devis ou un ticket (photo ou scan, en français le plus souvent).
Réponds UNIQUEMENT par un objet JSON, sans texte autour, avec ces clés :
{"type":"facture"|"devis"|"ticket"|"autre","emetteur":string,"emetteur_siret":string|null,"destinataire":string|null,"destinataire_adresse":string|null,
"numero":string|null,"date":"AAAA-MM-JJ"|null,"echeance":"AAAA-MM-JJ"|null,"total_ht":number|null,"total_tva":number|null,"total_ttc":number|null,
"lignes":[{"label":string,"qty":number,"price_ht":number,"tva":number}],"categorie":string,"paye":boolean|null,"resume":string}
Règles : montants en nombres (point décimal, sans symbole). N'invente rien : null si absent. "categorie" = un mot (Matériel, Carburant, Sous-traitance, Outillage, Fournitures, Repas, Loyer, Assurance, Logiciel, Autre).
"resume" = une phrase courte en français. Dates au format AAAA-MM-JJ (les dates françaises sont JJ/MM/AAAA).`

function extraireJson(t: string) {
  const s = t.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b < a) return null
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (rateLimited(`analyse:${user.id}`, 15)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: { wsId?: string; images?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const images = (body.images ?? []).filter((x) => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 6_000_000).slice(0, 2)
  if (!images.length || !body.wsId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const { data: membre } = await db.from('workspace_members').select('role').eq('workspace_id', body.wsId).eq('user_id', user.id).maybeSingle()
  if (!membre) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const key = process.env.ANTHROPIC_API_KEY, groq = process.env.GROQ_API_KEY
  if (key) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 1500, system: CONSIGNE,
        messages: [{ role: 'user', content: [...images.map((u) => ({ type: 'image', source: { type: 'base64', media_type: u.slice(5, u.indexOf(';')), data: u.split(',')[1] } })), { type: 'text', text: 'Lis ce document et réponds en JSON.' }] }] }),
    }).catch(() => null)
    if (r?.ok) { const d = await r.json(); const j = extraireJson((d.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')); if (j) return NextResponse.json({ ok: true, data: j, moteur: 'claude' }) }
  }
  if (!groq) return NextResponse.json({ error: 'no_key' }, { status: 501 })
  for (const modele of (process.env.GROQ_VISION ?? 'qwen/qwen3.8-27b,meta-llama/llama-4-scout-17b-16e-instruct').split(',').map((m) => m.trim()).filter(Boolean)) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${groq}` },
      body: JSON.stringify({ model: modele, max_tokens: 1800, temperature: 0.1, messages: [{ role: 'system', content: CONSIGNE }, { role: 'user', content: [...images.map((u) => ({ type: 'image_url', image_url: { url: u } })), { type: 'text', text: 'Lis ce document et réponds en JSON.' }] }] }),
    }).catch(() => null)
    if (!r || !r.ok) continue
    const d = await r.json()
    const j = extraireJson(String(d.choices?.[0]?.message?.content ?? ''))
    if (j) return NextResponse.json({ ok: true, data: j, moteur: `groq:${modele}` })
  }
  return NextResponse.json({ error: 'illisible' }, { status: 422 })
}
