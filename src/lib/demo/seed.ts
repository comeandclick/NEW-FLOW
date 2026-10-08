/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEMO_EMAIL, DEMO_USER_ID, DEMO_WORKSPACE_SLUG } from './constants'
import type { DemoDB, Row } from './mock-client'

const uid = (prefix: string, n: number) => {
  const hex = prefix.split('').map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(8, '0').slice(0, 8)
  return `${hex}-0000-4000-8000-${String(n).padStart(12, '0')}`
}

const doc = (...blocks: any[]) => ({ type: 'doc', content: blocks })
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const bullets = (...items: string[]) => ({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [p(t)] })) })
const todos = (...items: [string, boolean][]) => ({
  type: 'taskList',
  content: items.map(([t, c]) => ({ type: 'taskItem', attrs: { checked: c }, content: [p(t)] })),
})

/** Tiny sine-wave WAV as a data URI — lets the seeded voice note actually play. */
function beepWav(seconds = 2, freq = 440): string {
  const rate = 8000
  const n = Math.floor(rate * seconds)
  const buf = new Uint8Array(44 + n)
  const dv = new DataView(buf.buffer)
  const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate, true)
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true)
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 400, (n - i) / 400)
    buf[44 + i] = 128 + Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 40 * env * (0.6 + 0.4 * Math.sin(i / 900)))
  }
  let bin = ''
  buf.forEach((b) => (bin += String.fromCharCode(b)))
  return `data:audio/wav;base64,${typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')}`
}

export function createSeed(): DemoDB {
  const now = new Date()
  const at = (days: number, hour = 9, minute = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
  }
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
  const day = (days: number) => at(days).slice(0, 10)

  const ME = DEMO_USER_ID
  const LEA = uid('lea', 2), KARIM = uid('karim', 3), SOPHIE = uid('sophie', 4), THOMAS = uid('thomas', 5)
  const WS = uid('ws', 1)
  const created = at(-60)

  const profile = (id: string, name: string, email: string, status = 'online', extra: Row = {}): Row => ({
    id, email, full_name: name, avatar_url: null, locale: 'fr', timezone: 'Europe/Paris', status, is_admin: false, preferences: {}, created_at: created, updated_at: created, ...extra,
  })
  const profiles: Row[] = [
    profile(ME, 'Alex Demo', DEMO_EMAIL, 'online', { is_admin: true }),
    profile(LEA, 'Léa Martin', 'lea.martin@flow.app'),
    profile(KARIM, 'Karim Benali', 'karim.benali@flow.app', 'away'),
    profile(SOPHIE, 'Sophie Dubois', 'sophie.dubois@flow.app'),
    profile(THOMAS, 'Thomas Leroy', 'thomas.leroy@flow.app', 'offline'),
  ]
  const workspaces: Row[] = [
    { id: WS, name: 'Flow Demo', slug: DEMO_WORKSPACE_SLUG, logo_url: null, owner_id: ME, plan: 'free', settings: {}, created_at: created, updated_at: created },
  ]
  const workspace_members: Row[] = ([[ME, 'owner'], [LEA, 'admin'], [KARIM, 'member'], [SOPHIE, 'member'], [THOMAS, 'viewer']] as const).map(
    ([user, role], i) => ({ id: uid('wm', i + 1), workspace_id: WS, user_id: user, role, invited_by: i === 0 ? null : ME, joined_at: created }),
  )

  const P1 = uid('proj', 1), P2 = uid('proj', 2), P3 = uid('proj', 3)
  const proj = (id: string, name: string, description: string, color: string, by: string): Row => ({
    id, workspace_id: WS, name, description, color, icon: null, status: 'active', created_by: by, created_at: created, updated_at: created, deleted_at: null,
  })
  const projects = [
    proj(P1, 'Lancement v2.0', 'Nouvelle version du produit avec onboarding repensé.', '#6366f1', ME),
    proj(P2, 'Site marketing', 'Refonte du site vitrine et des pages tarifs.', '#22c55e', LEA),
    proj(P3, 'Application mobile', 'Prototype iOS / Android.', '#f97316', KARIM),
  ]

  const T = (n: number, title: string, status: string, priority: string, assignee: string | null, project: string | null, due: number | null, tags: string[] = [], description: string | null = null): Row => ({
    id: uid('task', n), workspace_id: WS, project_id: project, parent_id: null, title, description, status, priority, assignee_id: assignee, created_by: ME,
    due_date: due === null ? null : at(due, 18), completed_at: status === 'done' ? at(-1) : null, position: n * 1000, tags, estimate_minutes: [30, 60, 120, 240, null][n % 5],
    created_at: at(-14 + n), updated_at: at(-(n % 5)), deleted_at: null,
  })
  const tasks: Row[] = [
    T(1, 'Finaliser le nouvel onboarding', 'in_progress', 'high', ME, P1, 2, ['produit', 'ux'], 'Revoir les 4 écrans du parcours et valider avec le design.'),
    T(2, 'Préparer la démo client', 'todo', 'urgent', ME, P1, 1, ['client']),
    T(3, 'Rédiger la page tarifs', 'in_review', 'medium', LEA, P2, 3, ['contenu']),
    T(4, 'Corriger le bug de synchronisation', 'in_progress', 'high', KARIM, P1, 0, ['bug']),
    T(5, 'Intégrer le paiement Stripe', 'todo', 'high', KARIM, P1, 6, ['tech']),
    T(6, 'Maquettes écran profil', 'done', 'medium', SOPHIE, P3, -2, ['design']),
    T(7, 'Audit SEO du site', 'backlog', 'low', LEA, P2, 9, ['seo']),
    T(8, 'Mettre à jour la documentation API', 'todo', 'medium', THOMAS, P1, 5, ['doc']),
    T(9, 'Tests de charge', 'in_review', 'medium', KARIM, P1, 4, ['tech', 'qa']),
    T(10, 'Prototype navigation mobile', 'in_progress', 'medium', SOPHIE, P3, 7, ['design', 'mobile']),
    T(11, 'Newsletter de lancement', 'backlog', 'low', LEA, P2, 10, ['marketing']),
    T(12, 'Rétrospective sprint 11', 'done', 'low', ME, null, -4, ['équipe']),
    T(13, 'Choisir le fournisseur d’emailing', 'done', 'medium', ME, P2, -6, ['outils']),
    T(14, 'Planifier le sprint 12', 'todo', 'medium', ME, null, 3, ['équipe']),
  ]
  tasks.push({ ...T(15, 'Écran 1 — bienvenue', 'done', 'low', SOPHIE, P1, -1), parent_id: uid('task', 1) })
  tasks.push({ ...T(16, 'Écran 2 — création de l’espace', 'in_progress', 'medium', SOPHIE, P1, 1), parent_id: uid('task', 1) })

  const task_comments: Row[] = [
    { id: uid('tcom', 1), workspace_id: WS, task_id: uid('task', 1), user_id: LEA, content: 'J’ai ajouté les textes pour l’écran 3.', created_at: ago(300) },
    { id: uid('tcom', 2), workspace_id: WS, task_id: uid('task', 1), user_id: SOPHIE, content: 'Maquettes à jour dans Figma, prêtes pour relecture.', created_at: ago(120) },
  ]

  const N = (n: number, title: string, content: any, tags: string[], kind = 'note', pinned = false, project: string | null = null, icon: string | null = null): Row => ({
    id: uid('note', n), workspace_id: WS, project_id: project, parent_id: null, kind, title, icon, content, tags, is_pinned: pinned,
    created_by: ME, created_at: at(-10 + n), updated_at: at(-n), deleted_at: null,
  })
  const notes: Row[] = [
    N(1, 'Réunion de lancement du projet', doc(h(2, 'Objectifs'), p('Définir la roadmap du trimestre, aligner les équipes et établir les indicateurs de succès.'), h(2, 'Décisions'), bullets('Lancement public le 15 du mois prochain', 'Budget marketing validé', 'Sprint de stabilisation avant la release'), h(2, 'Actions'), todos(['Envoyer le compte rendu', true], ['Réserver la salle de démo', false], ['Valider le planning avec Léa', false])), ['projet', 'réunion'], 'note', true, P1, '📌'),
    N(2, 'Idées produit — brainstorm', doc(h(2, 'Pistes'), bullets('Améliorer l’onboarding', 'Tableau de bord personnalisable', 'Notifications intelligentes', 'Mode hors-ligne')), ['produit', 'idées'], 'note', false, null, '💡'),
    N(3, 'Architecture technique v2', doc(h(1, 'Architecture v2'), p('Phase 1 : API Gateway. Phase 2 : bus d’événements. Phase 3 : migration des services de messagerie.')), ['tech'], 'doc', true, null, '🧱'),
    N(4, 'Retours utilisateurs — sprint 11', doc(h(2, 'Synthèse'), p('Retours très positifs sur la vitesse. Points d’amélioration : navigation mobile et recherche.')), ['ux', 'feedback']),
    N(5, 'Guide de style rédactionnel', doc(h(2, 'Ton'), p('Clair, direct, chaleureux. Phrases courtes, pas de jargon inutile.')), ['marketing'], 'wiki', false, P2, '✍️'),
    N(6, 'Bienvenue dans l’équipe', doc(h(1, 'Bienvenue 👋'), p('Ce wiki rassemble tout ce qu’il faut savoir pour démarrer : outils, rituels, contacts utiles.'), bullets('Standup chaque matin à 9h', 'Sprint de deux semaines', 'Revue de code sous 24h')), ['onboarding'], 'wiki', true, null, '🚀'),
  ]
  const note_versions: Row[] = [
    { id: uid('nv', 1), workspace_id: WS, note_id: uid('note', 1), title: 'Réunion de lancement du projet', content: doc(h(2, 'Objectifs'), p('Première version.')), saved_by: ME, created_at: ago(2880) },
  ]

  const events: Row[] = [
    { title: 'Standup quotidien', s: at(0, 9, 0), e: at(0, 9, 15), color: '#6366f1', loc: 'Salle Aurore' },
    { title: 'Sprint review', s: at(1, 14, 0), e: at(1, 15, 30), color: '#22c55e' },
    { title: 'Démo client', s: at(2, 10, 0), e: at(2, 11, 0), color: '#f97316', loc: 'Visio' },
    { title: 'Formation équipe', s: at(3, 9, 0), e: at(3, 17, 0), color: '#8b5cf6' },
    { title: 'Planning sprint 12', s: at(4, 10, 0), e: at(4, 12, 0), color: '#6366f1' },
    { title: 'Lancement v2.0', s: at(7, 0, 0), e: at(7, 0, 0), color: '#ec4899', all: true },
    { title: 'Revue de code', s: at(-1, 15, 0), e: at(-1, 16, 0), color: '#0ea5e9' },
  ].map((e: any, i) => ({
    id: uid('event', i + 1), workspace_id: WS, title: e.title, description: null, start_at: e.s, end_at: e.e, all_day: Boolean(e.all), color: e.color,
    location: e.loc ?? null, attendees: [ME, LEA], task_id: null, meeting_id: null, created_by: ME, created_at: created, updated_at: created, deleted_at: null,
  }))

  const C_GEN = uid('conv', 1), C_PROD = uid('conv', 2), C_DESIGN = uid('conv', 3), C_DM = uid('conv', 4)
  const conversations: Row[] = [
    { id: C_GEN, workspace_id: WS, type: 'channel', name: 'general', description: 'Annonces et discussions générales', is_private: false, created_by: ME, created_at: created, updated_at: ago(15) },
    { id: C_PROD, workspace_id: WS, type: 'channel', name: 'produit', description: 'Roadmap et décisions produit', is_private: false, created_by: ME, created_at: created, updated_at: ago(90) },
    { id: C_DESIGN, workspace_id: WS, type: 'channel', name: 'design', description: null, is_private: false, created_by: SOPHIE, created_at: created, updated_at: ago(240) },
    { id: C_DM, workspace_id: WS, type: 'dm', name: null, description: null, is_private: true, created_by: ME, created_at: created, updated_at: ago(45) },
  ]
  const mem = (conv: string, users: string[], base: number): Row[] => users.map((u, i) => ({
    id: uid('cm', base + i), conversation_id: conv, user_id: u, role: 'member', last_read_at: u === ME ? ago(5) : ago(60), muted: false, joined_at: created,
  }))
  const conversation_members: Row[] = [
    ...mem(C_GEN, [ME, LEA, KARIM, SOPHIE, THOMAS], 10), ...mem(C_PROD, [ME, LEA, KARIM], 20), ...mem(C_DESIGN, [ME, SOPHIE, LEA], 30), ...mem(C_DM, [ME, LEA], 40),
  ]
  const M = (n: number, conv: string, user: string, content: string | null, minutes: number, extra: Row = {}): Row => ({
    id: uid('msg', n), conversation_id: conv, user_id: user, content, parent_id: null, kind: 'text', attachments: [], mentions: [], is_pinned: false, is_edited: false,
    deleted_at: null, created_at: ago(minutes), updated_at: ago(minutes), ...extra,
  })
  const wave = Array.from({ length: 40 }, (_, i) => Math.round(25 + 60 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.31))))
  const messages: Row[] = [
    M(1, C_GEN, ME, 'Bienvenue sur Flow 👋 Voici l’espace de démonstration.', 600, { is_pinned: true }),
    M(2, C_GEN, LEA, 'Super ! Le nouveau design du tableau de bord est vraiment propre.', 580),
    M(3, C_GEN, KARIM, 'Je merge la correction de synchronisation cet après-midi.', 120),
    M(4, C_GEN, SOPHIE, 'Les maquettes du profil sont prêtes pour relecture.', 30),
    M(5, C_GEN, LEA, null, 22, { kind: 'voice', attachments: [{ type: 'audio', url: beepWav(2, 520), duration: 2, waveform: wave, mime: 'audio/wav' }] }),
    M(6, C_GEN, ME, 'Parfait, on en parle au standup demain.', 15),
    M(7, C_PROD, ME, 'Priorité de la semaine : onboarding + démo client.', 200),
    M(8, C_PROD, LEA, 'Je prépare le deck pour la démo, retour avant 17h.', 150),
    M(9, C_PROD, KARIM, 'Le paiement Stripe sera dans le sprint 12.', 90),
    M(10, C_DESIGN, SOPHIE, 'Nouvelle palette de couleurs en cours de validation.', 300),
    M(11, C_DESIGN, ME, 'Elle me plaît, bonne direction.', 240),
    M(12, C_DM, LEA, 'Tu as cinq minutes pour relire la page tarifs ?', 60),
    M(13, C_DM, ME, 'Oui, je regarde ça maintenant.', 45),
  ]
  const reactions: Row[] = [
    { id: uid('react', 1), message_id: uid('msg', 1), user_id: LEA, emoji: '👍', created_at: ago(590) },
    { id: uid('react', 2), message_id: uid('msg', 1), user_id: KARIM, emoji: '🎉', created_at: ago(585) },
    { id: uid('react', 3), message_id: uid('msg', 4), user_id: ME, emoji: '👍', created_at: ago(25) },
  ]

  const files: Row[] = [
    ['Cahier des charges v2.pdf', 'application/pdf', 482_000, '/'], ['Logo Flow.svg', 'image/svg+xml', 3_200, '/Design'],
    ['Maquette onboarding.png', 'image/png', 1_240_000, '/Design'], ['Budget T4.xlsx', 'application/vnd.ms-excel', 58_000, '/Finance'],
    ['Notes de réunion.txt', 'text/plain', 1_800, '/'],
  ].map(([name, mime, size, folder], i) => ({
    id: uid('file', i + 1), workspace_id: WS, folder, name, size, mime_type: mime, storage_path: `${WS}/demo/${i + 1}-${name}`, uploaded_by: [ME, SOPHIE, SOPHIE, LEA, ME][i], created_at: ago(1000 + i * 700), deleted_at: null,
  }))

  const meetings: Row[] = [
    { id: uid('meet', 1), workspace_id: WS, title: 'Point hebdomadaire équipe', description: 'Revue de l’avancement et blocages.', host_id: ME, room: 'demo-weekly', status: 'scheduled', scheduled_at: at(1, 10, 0), started_at: null, ended_at: null, summary: null, created_at: created, deleted_at: null },
    { id: uid('meet', 2), workspace_id: WS, title: 'Rétrospective sprint 11', description: null, host_id: ME, room: 'demo-retro', status: 'ended', scheduled_at: at(-4, 15, 0), started_at: at(-4, 15, 0), ended_at: at(-4, 16, 0), summary: 'Bonne vélocité. À améliorer : estimation des tâches et revue de code plus rapide.', created_at: created, deleted_at: null },
  ]

  const goals: Row[] = [
    { id: uid('goal', 1), workspace_id: WS, title: 'Lancer la v2.0', description: 'Release publique avec le nouvel onboarding.', target: 100, current: 65, unit: '%', status: 'active', color: '#6366f1', due_date: day(21), created_by: ME, created_at: created, updated_at: created, deleted_at: null },
    { id: uid('goal', 2), workspace_id: WS, title: 'Atteindre 1 000 utilisateurs', description: null, target: 1000, current: 420, unit: 'users', status: 'active', color: '#22c55e', due_date: day(60), created_by: ME, created_at: created, updated_at: created, deleted_at: null },
    { id: uid('goal', 3), workspace_id: WS, title: 'Réduire le temps de chargement', description: null, target: 100, current: 100, unit: '%', status: 'completed', color: '#f97316', due_date: day(-10), created_by: KARIM, created_at: created, updated_at: created, deleted_at: null },
  ]
  const key_results: Row[] = [
    { id: uid('kr', 1), workspace_id: WS, goal_id: uid('goal', 1), title: 'Onboarding validé', target: 100, current: 80, unit: '%', created_at: created },
    { id: uid('kr', 2), workspace_id: WS, goal_id: uid('goal', 1), title: 'Paiement intégré', target: 100, current: 30, unit: '%', created_at: created },
    { id: uid('kr', 3), workspace_id: WS, goal_id: uid('goal', 2), title: 'Inscriptions via le site', target: 600, current: 280, unit: 'users', created_at: created },
  ]

  const crm_contacts: Row[] = [
    ['Camille Rousseau', 'camille@atelier-nord.fr', 'Atelier Nord', 'Directrice', 'customer'], ['Julien Moreau', 'julien@brightlabs.io', 'BrightLabs', 'CTO', 'prospect'],
    ['Inès Haddad', 'ines@maison-verte.com', 'Maison Verte', 'Responsable achats', 'lead'], ['Paul Girard', 'paul@girard-conseil.fr', 'Girard Conseil', 'Fondateur', 'customer'],
    ['Nora Lefèvre', 'nora@studio-onde.fr', 'Studio Onde', 'Productrice', 'prospect'],
  ].map(([name, email, company, position, status], i) => ({
    id: uid('crmc', i + 1), workspace_id: WS, name, email, phone: `+33 6 12 34 56 ${10 + i}`, company, position, status, tags: [], notes: null, created_by: ME, created_at: created, updated_at: created, deleted_at: null,
  }))
  const crm_deals: Row[] = ([
    ['Abonnement annuel Atelier Nord', 4800, 'gagné', 100, 1, -3], ['Déploiement BrightLabs', 12000, 'négociation', 70, 2, 14], ['Pack équipe Maison Verte', 2400, 'qualification', 40, 3, 30],
    ['Licence Girard Conseil', 3600, 'gagné', 100, 4, -9], ['Projet Studio Onde', 7500, 'proposition', 55, 5, 21], ['Pilote Maison Verte', 1200, 'prospection', 15, 3, 45],
  ] as const).map(([title, value, stage, probability, contact, closeIn], i) => ({
    id: uid('deal', i + 1), workspace_id: WS, contact_id: uid('crmc', contact), title, value, currency: 'EUR', stage, probability, close_date: day(closeIn), position: i, created_by: ME, created_at: created, updated_at: created, deleted_at: null,
  }))

  const automations: Row[] = [
    { id: uid('auto', 1), workspace_id: WS, name: 'Notifier à la fin d’une tâche', trigger_type: 'task_done', trigger_config: {}, action_type: 'notify', action_config: { message: 'Une tâche vient d’être terminée' }, is_active: true, run_count: 12, last_run_at: ago(180), created_by: ME, created_at: created },
    { id: uid('auto', 2), workspace_id: WS, name: 'Message de bienvenue', trigger_type: 'member_joined', trigger_config: {}, action_type: 'send_message', action_config: { message: 'Bienvenue dans l’équipe !' }, is_active: false, run_count: 3, last_run_at: ago(2000), created_by: ME, created_at: created },
  ]

  const whiteboards: Row[] = [{
    id: uid('wb', 1), workspace_id: WS, name: 'Brainstorm v2', created_by: ME, created_at: created, updated_at: created, deleted_at: null,
    items: [
      { id: 'a', type: 'sticky', x: 80, y: 80, w: 190, h: 130, text: 'Idée : mode hors-ligne', color: '#fde68a' },
      { id: 'b', type: 'sticky', x: 320, y: 100, w: 190, h: 130, text: 'Refaire l’onboarding', color: '#bbf7d0' },
      { id: 'c', type: 'sticky', x: 200, y: 290, w: 190, h: 130, text: 'Questions pour la démo', color: '#bfdbfe' },
    ],
  }]

  const habits: Row[] = [
    { id: uid('hab', 1), workspace_id: WS, user_id: ME, name: 'Lecture 20 min', color: '#6366f1', target_per_week: 5, created_at: created, deleted_at: null },
    { id: uid('hab', 2), workspace_id: WS, user_id: ME, name: 'Sport', color: '#22c55e', target_per_week: 3, created_at: created, deleted_at: null },
    { id: uid('hab', 3), workspace_id: WS, user_id: ME, name: 'Méditation', color: '#f97316', target_per_week: 7, created_at: created, deleted_at: null },
  ]
  const habit_logs: Row[] = []
  ;[0, 1, 2, 4, 5].forEach((d, i) => habit_logs.push({ id: uid('hl', i + 1), habit_id: uid('hab', 1), workspace_id: WS, day: day(-d) }))
  ;[1, 3, 6].forEach((d, i) => habit_logs.push({ id: uid('hl', 20 + i), habit_id: uid('hab', 2), workspace_id: WS, day: day(-d) }))
  ;[0, 1, 2, 3, 4, 5, 6].forEach((d, i) => habit_logs.push({ id: uid('hl', 40 + i), habit_id: uid('hab', 3), workspace_id: WS, day: day(-d) }))

  const time_entries: Row[] = [
    { id: uid('te', 1), workspace_id: WS, user_id: ME, task_id: uid('task', 1), project_id: P1, note: 'Onboarding — écrans 1 à 3', kind: 'work', started_at: at(-1, 9, 0), ended_at: at(-1, 11, 30), created_at: created },
    { id: uid('te', 2), workspace_id: WS, user_id: ME, task_id: uid('task', 2), project_id: P1, note: 'Slides démo', kind: 'work', started_at: at(-1, 14, 0), ended_at: at(-1, 15, 45), created_at: created },
    { id: uid('te', 3), workspace_id: WS, user_id: ME, task_id: null, project_id: null, note: null, kind: 'focus', started_at: at(0, 8, 30), ended_at: at(0, 8, 55), created_at: created },
  ]

  const invoices: Row[] = [
    { id: uid('inv', 1), workspace_id: WS, number: 'F-2026-001', kind: 'invoice', contact_id: uid('crmc', 1), status: 'paid', currency: 'EUR', items: [{ label: 'Abonnement annuel', qty: 1, price: 4800 }], total: 4800, issued_at: day(-10), due_at: day(20), created_by: ME, created_at: created, deleted_at: null },
    { id: uid('inv', 2), workspace_id: WS, number: 'D-2026-004', kind: 'quote', contact_id: uid('crmc', 2), status: 'sent', currency: 'EUR', items: [{ label: 'Déploiement', qty: 1, price: 9000 }, { label: 'Formation', qty: 2, price: 1500 }], total: 12000, issued_at: day(-2), due_at: day(28), created_by: ME, created_at: created, deleted_at: null },
    { id: uid('inv', 3), workspace_id: WS, number: 'N-2026-012', kind: 'expense', contact_id: null, status: 'paid', currency: 'EUR', items: [{ label: 'Hébergement', qty: 1, price: 89 }], total: 89, issued_at: day(-5), due_at: null, created_by: ME, created_at: created, deleted_at: null },
  ]

  const forms: Row[] = [{
    id: uid('form', 1), workspace_id: WS, title: 'Retour d’expérience', description: 'Aidez-nous à améliorer Flow.', is_public: true, slug: 'demo-feedback', created_by: ME, created_at: created, deleted_at: null,
    fields: [
      { id: 'f1', type: 'text', label: 'Votre nom', required: true },
      { id: 'f2', type: 'select', label: 'Fonctionnalité préférée', options: ['Tâches', 'Notes', 'Messages', 'Visio'], required: false },
      { id: 'f3', type: 'textarea', label: 'Un commentaire ?', required: false },
    ],
  }]
  const form_responses: Row[] = [
    { id: uid('fr', 1), workspace_id: WS, form_id: uid('form', 1), answers: { f1: 'Marie', f2: 'Messages', f3: 'Très fluide, bravo !' }, created_at: ago(1500) },
  ]

  const notifications: Row[] = [
    { id: uid('notif', 1), user_id: ME, workspace_id: WS, type: 'task', title: 'Nouvelle tâche assignée', body: 'Préparer la démo client', url: `/app/${DEMO_WORKSPACE_SLUG}/tasks`, is_read: false, created_at: ago(40) },
    { id: uid('notif', 2), user_id: ME, workspace_id: WS, type: 'message', title: 'Léa Martin', body: 'Tu as cinq minutes pour relire la page tarifs ?', url: `/app/${DEMO_WORKSPACE_SLUG}/messages/${C_DM}`, is_read: false, created_at: ago(60) },
    { id: uid('notif', 3), user_id: ME, workspace_id: WS, type: 'mention', title: 'Karim vous a mentionné', body: 'Merci pour la relecture !', url: null, is_read: true, created_at: ago(900) },
  ]
  const activity_logs: Row[] = ([
    ['task.created', 'task', 'Préparer la démo client', ME, 40], ['task.updated', 'task', 'Corriger le bug de synchronisation', KARIM, 95], ['note.created', 'note', 'Guide de style rédactionnel', LEA, 180],
    ['task.completed', 'task', 'Maquettes écran profil', SOPHIE, 300], ['event.created', 'event', 'Planning sprint 12', ME, 420], ['member.joined', 'member', 'Thomas Leroy', THOMAS, 1500],
    ['task.updated', 'task', 'Finaliser le nouvel onboarding', ME, 1700], ['note.updated', 'note', 'Architecture technique v2', ME, 2400],
  ] as const).map(([action, entity, title, user, minutes], i) => ({
    id: uid('act', i + 1), workspace_id: WS, user_id: user, action, entity_type: entity, entity_id: null, meta: { title }, created_at: ago(minutes),
  }))
  const favorites: Row[] = [
    { id: uid('fav', 1), user_id: ME, workspace_id: WS, entity_type: 'note', entity_id: uid('note', 1), title: 'Réunion de lancement du projet', url: `/app/${DEMO_WORKSPACE_SLUG}/notes/${uid('note', 1)}`, created_at: created },
  ]

  return {
    profiles, workspaces, workspace_members, invitations: [], projects, tasks, task_comments, notes, note_versions, events, conversations, conversation_members, messages, reactions,
    files, meetings, goals, key_results, crm_contacts, crm_deals, automations, whiteboards, habits, habit_logs, time_entries, invoices, forms, form_responses, notifications,
    push_subscriptions: [], activity_logs, favorites, meeting_participants: [],
  }
}
