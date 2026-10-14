import 'server-only'
// Appel de l'IA côté serveur, pour du texte (14/10/2026) : Claude si ANTHROPIC_API_KEY existe, sinon Groq (gratuit) en
// passant au modèle suivant quand l'un atteint sa limite. Utilisé par la rédaction des notes ; l'assistant a sa propre route.
type Msg = { role: 'user' | 'assistant'; content: string }

export async function genererTexte(system: string, messages: Msg[], max = 1500): Promise<{ texte: string; moteur: string } | { erreur: 'no_key' | 'limite' | 'upstream' }> {
  const key = process.env.ANTHROPIC_API_KEY, groq = process.env.GROQ_API_KEY
  if (!key && !groq) return { erreur: 'no_key' }
  if (key) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: max, system, messages }),
    }).catch(() => null)
    if (r?.ok) { const d = await r.json(); return { texte: (d.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim(), moteur: 'claude' } }
    if (!groq) return { erreur: 'upstream' }
  }
  const modeles = (process.env.GROQ_MODELES ?? 'openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b').split(',').map((m) => m.trim()).filter(Boolean)
  for (const modele of modeles) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${groq}` },
      body: JSON.stringify({ model: modele, max_tokens: max, temperature: 0.5, messages: [{ role: 'system', content: system }, ...messages] }),
    }).catch(() => null)
    if (!r || r.status === 429 || r.status === 413 || r.status === 404 || r.status === 400 || r.status >= 500) continue
    if (!r.ok) return { erreur: 'upstream' }
    const d = await r.json()
    const texte = String(d.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (texte) return { texte, moteur: `groq:${modele}` }
  }
  return { erreur: 'limite' }
}
