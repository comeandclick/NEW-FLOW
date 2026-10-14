import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'
import { OUTILS, versWidget } from '@/lib/ai-widgets'
import { contexteEspace } from '@/lib/ai-contexte'

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
  const key = process.env.ANTHROPIC_API_KEY, groq = process.env.GROQ_API_KEY
  if (!key && !groq) return NextResponse.json({ error: 'no_key' }, { status: 501 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (limited(user.id)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: { messages?: Msg[]; context?: unknown; locale?: string; wsId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const messages = (body.messages ?? []).slice(-8).filter((m) => typeof m.content === 'string' && m.content.length < 4000)
  if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // données de l'espace lues ici, avec la session de l'utilisateur (ses droits), donc toujours à jour
  const wsId = String(body.wsId ?? '')
  const { data: membre } = wsId ? await db.from('workspace_members').select('user_id').eq('workspace_id', wsId).eq('user_id', user.id).maybeSingle() : { data: null }
  const contexte = membre ? await contexteEspace(db, wsId, user.id).catch(() => null) : null
  const system = `Tu es l'assistant de Flow, l'outil de travail de l'utilisateur (tâches, agenda, discussions, clients, fichiers, objectifs, CRM, motion design avec l'Atelier).
Tu parles ${body.locale === 'en' ? 'anglais' : 'français'}, en tutoyant, de façon chaleureuse, claire et brève (1 à 4 phrases), sans jargon. Pas de tiret cadratin.

RÈGLES
- Tu t'appuies UNIQUEMENT sur les données de l'espace ci-dessous (à jour au moment de la question). Si une information n'y est pas, dis-le simplement ; n'invente jamais un nom, une date, un chiffre ou un client.
- Dates : nous sommes le ${contexte?.maintenant ?? new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (heure de Paris). Dis « aujourd'hui », « demain », « jeudi 16 », jamais les dates techniques.
- Quand la réponse se montre mieux qu'elle ne se dit, écris une phrase courte (« Voici tous tes clients : ») PUIS appelle l'outil d'affichage. N'énumère pas toi-même ce que montre le widget. Outils : tâches, clients, fiche d'un client, vidéo, agenda, productions, notes, fichiers, discussions, activité, objectifs, CRM, équipe/agents IA, bilan, projets, focus.
- Clients : « mes clients », « quels sont mes clients » = afficher_clients filtre=tous (TOUS les clients). filtre=attente SEULEMENT si on demande qui attend quelque chose. Un client nommé = afficher_client.
- Pour le reste (conseils, résumé, priorités, rédaction d'un message ou d'un compte rendu, explication), réponds normalement en texte, en citant les vrais éléments de l'espace.
- CRÉATION (tâche, rendez-vous, réunion, appel, note) : appelle TOUJOURS preparer_creation, même s'il manque des informations. Remplis ce qui est dit (« demain » = la date de demain, « la semaine prochaine » sans jour précis = laisse la date VIDE, « avec Adam » = avec, « avec un agent IA dispo » = assigne « agent IA »). Propose toi-même un titre court si l'utilisateur n'en donne pas (« Rendez-vous avec Adam »). Une personne absente des données (client, ami, prestataire) n'est PAS un problème : mets-la dans avec, crée quand même. Ne demande pas en texte ce qui manque : le formulaire affiche une case à remplir. Phrase courte du genre « Je prépare le rendez-vous, il me manque le jour : ». Si l'utilisateur complète ensuite dans le chat, rappelle preparer_creation avec TOUS les champs (anciens + nouveaux). Ne dis jamais que c'est créé : l'utilisateur valide avec le bouton Créer.
- Agents IA : ce sont les membres marqués agentIA et les agents de l'Atelier (avec leur état libre / occupé / limite). Si on te demande un agent disponible, propose celui qui est libre.
- Reste dans le sujet de CET espace : n'évoque jamais d'autres projets ou entreprises que ceux présents dans les données.

DONNÉES DE L'ESPACE
${contexte?.texte ?? 'indisponibles'}`

  // 1) Claude (clé Anthropic) si elle existe ; 2) sinon Groq (gratuit) : une seule clé, et on passe au modèle suivant quand l'un atteint
  //    sa limite (les limites gratuites de Groq sont par compte ET par modèle) ; 3) sinon la page bascule sur la compréhension locale.
  try {
    if (key) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages, tools: OUTILS, tool_choice: { type: 'auto' } }),
      })
      if (r.ok) {
        const data = await r.json()
        const blocs = (data.content ?? []) as { type: string; text?: string; name?: string; input?: Record<string, unknown> }[]
        const text = blocs.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
        const widgets = blocs.filter((c) => c.type === 'tool_use').map((c) => versWidget(c.name ?? '', c.input ?? {})).filter(Boolean)
        return NextResponse.json({ text, widgets, moteur: 'claude' })
      }
      if (!groq) return NextResponse.json({ error: 'upstream', status: r.status }, { status: 502 })
    }
    const modeles = (process.env.GROQ_MODELES ?? 'openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b').split(',').map((m) => m.trim()).filter(Boolean)
    const outils = OUTILS.map((o) => ({ type: 'function', function: { name: o.name, description: o.description, parameters: o.input_schema } }))
    for (const modele of modeles) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${groq}` },
        body: JSON.stringify({ model: modele, max_tokens: 900, temperature: 0.4, messages: [{ role: 'system', content: system }, ...messages], tools: outils, tool_choice: 'auto' }),
      })
      if (r.status === 429 || r.status === 413 || r.status === 404 || r.status === 400 || r.status >= 500) continue // limite atteinte ou modèle indisponible → modèle suivant
      if (!r.ok) return NextResponse.json({ error: 'upstream', status: r.status }, { status: 502 })
      const data = await r.json()
      const m = data.choices?.[0]?.message ?? {}
      const widgets = ((m.tool_calls ?? []) as { function: { name: string; arguments: string } }[]).map((c) => { try { return versWidget(c.function.name, JSON.parse(c.function.arguments || '{}')) } catch { return null } }).filter(Boolean)
      const text = String(m.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      return NextResponse.json({ text, widgets, moteur: `groq:${modele}` })
    }
    return NextResponse.json({ error: 'limite' }, { status: 429 })
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 })
  }
}
