// Notes internes d'un client (14/10/2026) : des notes ordinaires (table notes) étiquetées client:<id> + leur genre.
// Le portail du client ne lit jamais la table notes : elles restent entre l'équipe, l'assistant et les agents IA.
export const NOTE_GENRES = { note: 'Note', idee_video: 'Idée de vidéo', modele_motion: 'Modèle motion' } as const
export type NoteGenre = keyof typeof NOTE_GENRES

export const noteClientTags = (clientId: string, genre: NoteGenre) => ['client-interne', `client:${clientId}`, genre.replace('_', '-')]

/** Texte brut d'une note (document TipTap) : paragraphes séparés par des retours à la ligne. */
export function texteDeNote(doc: unknown): string {
  const lignes: string[] = []
  const parcourir = (n: unknown, sortie: string[]) => {
    if (!n || typeof n !== 'object') return
    const o = n as { type?: string; text?: string; content?: unknown[] }
    if (typeof o.text === 'string') sortie.push(o.text)
    if (Array.isArray(o.content)) {
      if (o.type === 'paragraph' || o.type === 'heading' || o.type === 'listItem') { const l: string[] = []; o.content.forEach((c) => parcourir(c, l)); lignes.push(l.join('')) }
      else o.content.forEach((c) => parcourir(c, sortie))
    }
  }
  parcourir(doc, lignes)
  return lignes.join('\n').trim()
}
