import 'server-only'
// Statistiques de l'admin : comptes, espaces, utilisation de chaque fonctionnalité (lignes créées), visites anonymes, support.
import { getAdminDb } from '@/lib/supabase/server'

const FONCTIONS: { table: string; nom: string; date?: string }[] = [
  { table: 'tasks', nom: 'Tâches' }, { table: 'notes', nom: 'Notes' }, { table: 'messages', nom: 'Messages' }, { table: 'events', nom: 'Calendrier' },
  { table: 'files', nom: 'Fichiers' }, { table: 'clients', nom: 'Clients' }, { table: 'crm_deals', nom: 'CRM (affaires)' }, { table: 'crm_contacts', nom: 'CRM (contacts)' },
  { table: 'goals', nom: 'Objectifs' }, { table: 'time_entries', nom: 'Focus & temps', date: 'started_at' }, { table: 'habits', nom: 'Habitudes' }, { table: 'projects', nom: 'Projets' },
  { table: 'captures', nom: 'Captures' }, { table: 'automations', nom: 'Automatisations' }, { table: 'forms', nom: 'Formulaires' }, { table: 'invoices', nom: 'Factures' },
  { table: 'motion_projets', nom: 'Motion design (Atelier)', date: 'maj' }, { table: 'studio_jobs', nom: 'Demandes à l\'Atelier' }, { table: 'client_messages', nom: 'Espaces clients (messages)' },
]
const jour = (d: Date) => d.toISOString().slice(0, 10)

export async function statistiques() {
  const db = getAdminDb()
  const depuis30 = new Date(Date.now() - 30 * 86400_000)
  // comptes (Supabase Auth)
  let users: { created_at: string; last_sign_in_at?: string | null; app_metadata?: { provider?: string } }[] = []
  for (let p = 1; p < 50; p++) { const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 }); users = users.concat(data?.users ?? []); if (!data || data.users.length < 200) break }
  const actifs = (j: number) => users.filter((u) => u.last_sign_in_at && Date.now() - new Date(u.last_sign_in_at).getTime() < j * 86400_000).length
  const inscriptionsParJour = Array.from({ length: 30 }, (_, i) => { const d = jour(new Date(Date.now() - (29 - i) * 86400_000)); return { jour: d, n: users.filter((u) => u.created_at.slice(0, 10) === d).length } })
  const fournisseurs = Object.entries(users.reduce<Record<string, number>>((m, u) => { const k = u.app_metadata?.provider ?? 'email'; m[k] = (m[k] ?? 0) + 1; return m }, {}))
  // espaces
  const { count: espaces } = await db.from('workspaces').select('id', { count: 'exact', head: true })
  const { count: membres } = await db.from('workspace_members').select('user_id', { count: 'exact', head: true })
  // fonctionnalités : total et créé ces 30 derniers jours
  const fonctions = (await Promise.all(FONCTIONS.map(async (f) => {
    const t = await db.from(f.table).select('*', { count: 'exact', head: true })
    if (t.error) return null
    const r = await db.from(f.table).select('*', { count: 'exact', head: true }).gte(f.date ?? 'created_at', depuis30.toISOString())
    return { nom: f.nom, total: t.count ?? 0, mois: r.error ? null : r.count ?? 0 }
  }))).filter(Boolean) as { nom: string; total: number; mois: number | null }[]
  fonctions.sort((a, b) => (b.mois ?? 0) - (a.mois ?? 0) || b.total - a.total)
  // stockage
  const { data: fichiers } = await db.from('files').select('size').is('deleted_at', null)
  const octets = (fichiers ?? []).reduce((n, f: { size: number | null }) => n + (f.size ?? 0), 0)
  // Atelier
  const { count: macs } = await db.from('studio_devices').select('id', { count: 'exact', head: true })
  // visites (table à créer : supabase/admin.sql)
  const v = await db.from('site_visites').select('jour,chemin,espace,provenance,appareil,pays,visite').gte('jour', jour(depuis30)).limit(50000)
  const visites = v.error ? null : (() => {
    const rows = v.data as { jour: string; chemin: string; espace: string; provenance: string | null; appareil: string | null; pays: string | null; visite: string | null }[]
    const parJour = Array.from({ length: 30 }, (_, i) => { const d = jour(new Date(Date.now() - (29 - i) * 86400_000)); const r = rows.filter((x) => x.jour === d); return { jour: d, vues: r.length, visiteurs: new Set(r.map((x) => x.visite)).size } })
    const top = (cle: 'chemin' | 'provenance' | 'appareil' | 'pays', filtre?: (x: (typeof rows)[number]) => boolean) =>
      Object.entries(rows.filter(filtre ?? (() => true)).reduce<Record<string, number>>((m, x) => { const k = x[cle] ?? '(direct)'; m[k] = (m[k] ?? 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10)
    return { vues: rows.length, visiteurs: new Set(rows.map((x) => `${x.jour}|${x.visite}`)).size, parJour, pagesSite: top('chemin', (x) => x.espace === 'site'), pagesApp: top('chemin', (x) => x.espace === 'app'), provenances: top('provenance'), appareils: top('appareil'), pays: top('pays') }
  })()
  const s = await db.from('support_demandes').select('*').order('cree_le', { ascending: false }).limit(200)
  return {
    genere: new Date().toISOString(),
    comptes: { total: users.length, actifs7: actifs(7), actifs30: actifs(30), nouveaux30: users.filter((u) => new Date(u.created_at) > depuis30).length, inscriptionsParJour, fournisseurs },
    espaces: espaces ?? 0, membres: membres ?? 0, fonctions, stockageGo: octets / 1024 ** 3, macs: macs ?? 0,
    visites, support: s.error ? null : s.data,
  }
}
