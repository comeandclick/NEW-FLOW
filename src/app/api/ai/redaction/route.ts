import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'
import { genererTexte } from '@/lib/ia-serveur'
import { texteDeNote } from '@/lib/client-notes'

// Rédaction des notes avec l'IA (14/10/2026).
// - rediger : écrit ce que l'utilisateur demande (« rédige 4 idées de motion pour ce projet ») en lisant toute la note,
//   les autres notes et les dossiers des clients et projets, pour comprendre de quel projet il s'agit.
// - ameliorer : corrige et reformule le texte sélectionné sans rien retirer.
export const runtime = 'nodejs'
const court = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { mode?: string; consigne?: string; selection?: string; noteId?: string; texteActuel?: string } | null
  if (!b || !['rediger', 'ameliorer'].includes(b.mode ?? '') || !b.noteId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const consigne = String(b.consigne ?? '').slice(0, 1500), selection = String(b.selection ?? '').slice(0, 8000)
  if (b.mode === 'rediger' && !consigne.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (b.mode === 'ameliorer' && !selection.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // la note (lue avec les droits de l'utilisateur : s'il ne la voit pas, rien ne sort)
  const { data: note } = await db.from('notes').select('id,workspace_id,title,content,tags,project_id').eq('id', b.noteId).is('deleted_at', null).maybeSingle()
  if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (b.mode === 'ameliorer') {
    const system = `Tu corriges et améliores un passage écrit en français par l'utilisateur dans ses notes de travail.
RÈGLES : corrige toutes les fautes (orthographe, grammaire, accords, ponctuation), reformule pour que ce soit clair, fluide et propre, garde le tutoiement ou le vouvoiement d'origine, garde la langue d'origine.
Ne supprime AUCUNE information, aucun nom, aucun chiffre, aucune idée ; n'en ajoute pas. Garde la structure (listes, numéros, titres) en la rendant propre.
Réponds UNIQUEMENT avec le texte amélioré, en Markdown simple (listes « - », « 1. », **gras** si utile), sans phrase d'introduction ni guillemets. Pas de tiret cadratin, pas d'emoji.`
    const r = await genererTexte(system, [{ role: 'user', content: `Contexte (titre de la note) : ${note.title || 'Sans titre'}\n\nPassage à améliorer :\n${selection}` }], 2000)
    return 'erreur' in r ? NextResponse.json({ error: r.erreur }, { status: r.erreur === 'limite' ? 429 : 502 }) : NextResponse.json(r)
  }

  const ws = note.workspace_id as string
  const [autres, projets, clients] = await Promise.all([
    db.from('notes').select('id,title,content,tags,project_id').eq('workspace_id', ws).is('deleted_at', null).neq('id', note.id).order('updated_at', { ascending: false }).limit(25),
    db.from('projects').select('id,name,description').eq('workspace_id', ws).is('deleted_at', null).limit(30),
    db.from('clients').select('id,name,company,notes').eq('workspace_id', ws).is('deleted_at', null).limit(30),
  ])
  const projet = (id: string | null) => (projets.data ?? []).find((p) => p.id === id)?.name
  const client = (tags: string[]) => (clients.data ?? []).find((c) => tags?.includes(`client:${c.id}`))?.name
  const dossier = (n: { project_id: string | null; tags: string[] }) => projet(n.project_id) ?? client(n.tags)
  const contexte = [
    `NOTE EN COURS : « ${note.title || 'Sans titre'} »${dossier(note) ? ` (dossier : ${dossier(note)})` : ''}\n${court(typeof b.texteActuel === 'string' && b.texteActuel.trim() ? b.texteActuel : texteDeNote(note.content), 6000) || '(vide)'}`,
    `CLIENTS ET LEUR PROJET :\n${(clients.data ?? []).map((c) => `- ${c.name}${c.company ? ` (${c.company})` : ''}${c.notes ? ` : ${court(String(c.notes).replace(/\s+/g, ' '), 500)}` : ''}`).join('\n') || '(aucun)'}`,
    `PROJETS :\n${(projets.data ?? []).map((p) => `- ${p.name}${p.description ? ` : ${court(p.description, 200)}` : ''}`).join('\n') || '(aucun)'}`,
    `AUTRES NOTES (récentes) :\n${(autres.data ?? []).map((n) => `- « ${n.title || 'Sans titre'} »${dossier(n) ? ` [${dossier(n)}]` : ''} : ${court(texteDeNote(n.content).replace(/\s+/g, ' '), 260)}`).join('\n')}`,
  ].join('\n\n')
  const system = `Tu rédiges dans les notes de travail de l'utilisateur (Flow), en français, en tutoyant.
D'abord, comprends de QUEL projet ou client il s'agit : le titre et le contenu de la note, son dossier, les autres notes et les dossiers des clients te le disent. Si la note parle d'un client (ex. MyUstadh = l'application de Nahim), sers-toi de tout ce qu'on sait sur lui.
Puis écris exactement ce qui est demandé, concret et adapté à CE projet (pas de généralités). Si on demande N idées, donne-en exactement N.
FORME : Markdown simple et propre : listes numérotées « 1. », « 2. » pour les idées ou étapes, **gras** pour le nom de chaque idée, « - » pour les détails, titres « ## » seulement si utile.
Réponds UNIQUEMENT avec le texte à insérer dans la note, sans phrase d'introduction ni de conclusion. Pas de tiret cadratin, pas d'emoji. N'invente pas de faits (noms, chiffres, dates) absents des données.

${court(contexte, 10000)}`
  const r = await genererTexte(system, [{ role: 'user', content: consigne }], 2200)
  return 'erreur' in r ? NextResponse.json({ error: r.erreur }, { status: r.erreur === 'limite' ? 429 : 502 }) : NextResponse.json(r)
}
