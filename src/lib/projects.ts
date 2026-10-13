/** Projets dans des projets (colonne parent_id) : arbre, chemin lisible « Kalimat › Kalimat 2.0 ». Fonctions pures, testées. */
type P = { id: string; name: string; parent_id?: string | null }

/** Parent réel d'un projet : ignoré s'il n'existe pas (supprimé) ou s'il ferait une boucle. */
function parentOf<T extends P>(p: T, byId: Map<string, T>): T | null {
  const parent = p.parent_id ? byId.get(p.parent_id) : undefined
  if (!parent || parent.id === p.id) return null
  // boucle (A dans B dans A) : on remonte au plus 20 niveaux
  let cur: T | undefined = parent; for (let i = 0; cur && i < 20; i++) { if (cur.id === p.id) return null; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
  return parent
}

/** « Kalimat › Kalimat 2.0 » (séparateur au choix). */
export function projectPath<T extends P>(id: string | null | undefined, projects: T[], sep = ' › '): string {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const names: string[] = []
  let cur = id ? byId.get(id) : undefined
  for (let i = 0; cur && i < 20; i++) { names.unshift(cur.name); cur = parentOf(cur, byId) ?? undefined }
  return names.join(sep)
}

/** Projets dans l'ordre de l'arbre (parent puis ses enfants, par nom), avec leur profondeur. */
export function projectTree<T extends P>(projects: T[]): { project: T; depth: number }[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const kids = new Map<string | null, T[]>()
  for (const p of projects) { const k = parentOf(p, byId)?.id ?? null; kids.set(k, [...(kids.get(k) ?? []), p]) }
  const out: { project: T; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const p of (kids.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'fr'))) { out.push({ project: p, depth }); if (depth < 20) walk(p.id, depth + 1) }
  }
  walk(null, 0)
  return out
}

/** Le projet et tous ses sous-projets (pour afficher les captures et tâches d'un projet principal). */
export function withDescendants<T extends P>(id: string, projects: T[]): string[] {
  return projectTree(projects).reduce<{ ids: string[]; inside: number | null }>((acc, { project, depth }) => {
    if (project.id === id) return { ids: [id], inside: depth }
    if (acc.inside !== null && depth > acc.inside) return { ids: [...acc.ids, project.id], inside: acc.inside }
    return { ids: acc.ids, inside: acc.inside !== null && depth <= acc.inside ? null : acc.inside }
  }, { ids: [], inside: null }).ids
}
