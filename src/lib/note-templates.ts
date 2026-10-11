export type NoteTemplate = { id: string; icon: string; kind: 'note' | 'doc'; tags: string[]; name: { fr: string; en: string }; title: { fr: string; en: string }; md: { fr: string; en: string } }

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'meeting', icon: '🗒️', kind: 'note', tags: ['réunion'], name: { fr: 'Compte rendu de réunion', en: 'Meeting notes' }, title: { fr: 'Réunion du ', en: 'Meeting of ' },
    md: {
      fr: '## Participants\n- \n\n## Ordre du jour\n- \n\n## Décisions\n- \n\n## Actions\n- [ ] \n- [ ] \n\n## Prochaine réunion\n',
      en: '## Attendees\n- \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Actions\n- [ ] \n- [ ] \n\n## Next meeting\n',
    },
  },
  {
    id: 'decision', icon: '⚖️', kind: 'doc', tags: ['décision'], name: { fr: 'Décision d’architecture', en: 'Decision record' }, title: { fr: 'Décision : ', en: 'Decision: ' },
    md: {
      fr: '## Contexte\nQuel problème, quelles contraintes ?\n\n## Options étudiées\n- Option A : \n- Option B : \n\n## Décision\nNous choisissons…\n\n## Conséquences\n- Positives : \n- Négatives : \n\n## Statut\nProposée\n',
      en: '## Context\nWhat problem, what constraints?\n\n## Options considered\n- Option A: \n- Option B: \n\n## Decision\nWe choose…\n\n## Consequences\n- Positive: \n- Negative: \n\n## Status\nProposed\n',
    },
  },
  {
    id: 'retro', icon: '🔁', kind: 'note', tags: ['rétro'], name: { fr: 'Rétrospective', en: 'Retrospective' }, title: { fr: 'Rétrospective du sprint', en: 'Sprint retrospective' },
    md: {
      fr: '## Ce qui a bien marché\n- \n\n## Ce qui a coincé\n- \n\n## À essayer\n- \n\n## Actions\n- [ ] \n',
      en: '## What went well\n- \n\n## What got in the way\n- \n\n## To try\n- \n\n## Actions\n- [ ] \n',
    },
  },
  {
    id: 'bug', icon: '🐞', kind: 'note', tags: ['bug'], name: { fr: 'Rapport de bug', en: 'Bug report' }, title: { fr: 'Bug : ', en: 'Bug: ' },
    md: {
      fr: '## Résumé\n\n## Étapes pour reproduire\n1. \n2. \n\n## Résultat obtenu\n\n## Résultat attendu\n\n## Environnement\n- Version : \n- Appareil : \n- Système : \n',
      en: '## Summary\n\n## Steps to reproduce\n1. \n2. \n\n## Actual result\n\n## Expected result\n\n## Environment\n- Version: \n- Device: \n- OS: \n',
    },
  },
  {
    id: 'testplan', icon: '✅', kind: 'doc', tags: ['test'], name: { fr: 'Plan de test avant sortie', en: 'Pre-release test plan' }, title: { fr: 'Plan de test — version ', en: 'Test plan — version ' },
    md: {
      fr: '## Parcours à vérifier\n- [ ] Inscription et connexion\n- [ ] Premier parcours complet\n- [ ] Achat et restauration\n- [ ] Mode hors-ligne\n- [ ] Notifications\n\n## Appareils\n- [ ] Petit iPhone\n- [ ] Grand iPhone\n- [ ] iOS minimum et dernier\n\n## Résultat\n',
      en: '## Flows to check\n- [ ] Sign-up and sign-in\n- [ ] First full run\n- [ ] Purchase and restore\n- [ ] Offline mode\n- [ ] Notifications\n\n## Devices\n- [ ] Small iPhone\n- [ ] Large iPhone\n- [ ] Minimum and latest iOS\n\n## Result\n',
    },
  },
  {
    id: 'brief', icon: '🧭', kind: 'doc', tags: ['produit'], name: { fr: 'Brief de fonctionnalité', en: 'Feature brief' }, title: { fr: 'Brief : ', en: 'Brief: ' },
    md: {
      fr: '## Problème\nQui rencontre quel problème, et à quelle fréquence ?\n\n## Objectif\nComment saura-t-on que c’est réussi ?\n\n## Solution proposée\n\n## Hors périmètre\n- \n\n## Questions ouvertes\n- \n\n## Découpage\n- [ ] \n',
      en: '## Problem\nWho has which problem, and how often?\n\n## Goal\nHow will we know it worked?\n\n## Proposed solution\n\n## Out of scope\n- \n\n## Open questions\n- \n\n## Breakdown\n- [ ] \n',
    },
  },
]
