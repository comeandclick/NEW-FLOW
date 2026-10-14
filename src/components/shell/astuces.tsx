'use client'
// Didacticiel discret (14/10/2026) : à la première ouverture d'une fonctionnalité, une petite carte en bas à droite
// donne 1 à 3 conseils. Une seule fois par page (gardé sur l'appareil), « Compris » ou ✕ la ferme, et on peut tout couper.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb, X } from 'lucide-react'

const ASTUCES: Record<string, { titre: string; etapes: string[] }> = {
  '': { titre: 'Bienvenue dans Flow', etapes: ['⌘K ouvre la recherche partout : pages, tâches, notes, personnes.', 'Le crayon en bas du menu masque ce que tu n\'utilises pas.', 'Demande à l\'assistant (étincelle en haut) « mes tâches de la semaine » : il répond avec un tableau.'] },
  '/tasks': { titre: 'Tâches', etapes: ['Tape une tâche et appuie sur Entrée : « demain 9h » ou « urgent » sont compris.', 'Glisse une tâche d\'une colonne à l\'autre pour changer son statut.'] },
  '/calendar': { titre: 'Calendrier', etapes: ['Clique sur un jour pour créer un événement.', 'Exporte ton agenda en .ics pour l\'ajouter à Apple Calendrier ou Google.'] },
  '/messages': { titre: 'Messages', etapes: ['Double-clic sur un message pour réagir avec ❤️.', 'Glisse un fichier dans la conversation pour l\'envoyer.'] },
  '/notes': { titre: 'Notes', etapes: ['Tape « / » dans une note pour insérer un titre, une liste ou une case à cocher.'] },
  '/files': { titre: 'Fichiers', etapes: ['Glisse des fichiers n\'importe où sur la page pour les ajouter.', 'Clique sur une vidéo ou une image pour l\'ouvrir en grand, avec « Télécharger ».'] },
  '/clients': { titre: 'Clients', etapes: ['Chaque client a son espace : copie son lien, il y voit ses vidéos, ses tâches et la discussion.', 'La pastille indique ce qui l\'attend : à valider, modifications, à jour.'] },
  '/crm': { titre: 'CRM', etapes: ['Ajoute un contact, puis une affaire : glisse-la d\'étape en étape jusqu\'à « Gagné ».'] },
  '/goals': { titre: 'Objectifs', etapes: ['Un objectif avance tout seul quand ses tâches liées sont terminées.'] },
  '/focus': { titre: 'Focus & temps', etapes: ['Lance un minuteur de 25 minutes : le temps est enregistré sur la tâche choisie.'] },
  '/motion': { titre: 'Motion design', etapes: ['Relie d\'abord l\'Atelier de ton Mac (Paramètres → Atelier) : c\'est lui qui fabrique les vidéos.', 'Lancer : choisis le client, le type, la voix, et suis l\'avancement dans Productions.'] },
  '/site': { titre: 'Création de site', etapes: ['Comme pour le motion, il faut un Mac relié avec l\'Atelier ouvert.'] },
  '/ai': { titre: 'Assistant', etapes: ['Demande « mes tâches du jour », « quels clients attendent ? » ou « la vidéo du cours … » : il répond avec des widgets cliquables.'] },
  '/me': { titre: 'Mon espace', etapes: ['Ici, tout est privé : personne d\'autre dans l\'espace ne le voit.'] },
}
const CLE = 'flow_astuces_vues'

export function Astuces({ base }: { base: string }) {
  const chemin = usePathname().replace(base, '') || ''
  const page = Object.keys(ASTUCES).filter((k) => (k === '' ? chemin === '' : chemin === k || chemin.startsWith(k + '/'))).sort((a, b) => b.length - a.length)[0]
  const [visible, setVisible] = useState<string | null>(null)
  const [i, setI] = useState(0)
  useEffect(() => {
    setVisible(null); setI(0)
    if (page === undefined) return
    let vues: string[] = []
    try { if (localStorage.getItem('flow_astuces_off') === '1') return; vues = JSON.parse(localStorage.getItem(CLE) || '[]') } catch { return }
    if (vues.includes(page)) return
    const t = setTimeout(() => setVisible(page), 1400) // laisse la page s'afficher d'abord
    return () => clearTimeout(t)
  }, [page])
  const fermer = () => { if (visible === null) return; try { const v = JSON.parse(localStorage.getItem(CLE) || '[]'); localStorage.setItem(CLE, JSON.stringify([...new Set([...v, visible])])) } catch {} setVisible(null) }
  const a = visible !== null ? ASTUCES[visible] : null
  return (
    <AnimatePresence>
      {a && (
        <motion.aside key={visible} role="status" aria-label={`Astuce : ${a.titre}`} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-50 w-[min(340px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-4 shadow-lg md:bottom-5 md:right-5">
          <button onClick={fermer} aria-label="Fermer" className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-text-3 hover:bg-text/5 hover:text-text"><X className="size-4" /></button>
          <div className="flex items-center gap-2 text-[12px] font-medium text-text-3"><Lightbulb className="size-3.5" />Astuce · {a.titre}</div>
          <p className="mt-2 pr-4 text-[13.5px] leading-relaxed text-text">{a.etapes[i]}</p>
          <div className="mt-3 flex items-center gap-2">
            {a.etapes.length > 1 && <div className="flex gap-1">{a.etapes.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-text' : 'w-1.5 bg-text/20'}`} />)}</div>}
            <button onClick={() => { try { localStorage.setItem('flow_astuces_off', '1') } catch {} fermer() }} className="ml-auto text-[12px] text-text-3 hover:text-text">Ne plus afficher</button>
            <button onClick={() => (i < a.etapes.length - 1 ? setI(i + 1) : fermer())} className="h-7 rounded-md bg-text px-3 text-[12px] font-medium text-bg hover:opacity-90">{i < a.etapes.length - 1 ? 'Suivant' : 'Compris'}</button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
