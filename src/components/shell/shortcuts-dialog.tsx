'use client'
import { Dialog } from '@/components/ui/overlay'
import { Kbd } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'
  const rows: [string[], string][] = [
    [['⌘', 'K'], fr ? 'Palette de commandes' : 'Command palette'],
    [['/'], fr ? 'Rechercher' : 'Search'],
    [['C'], fr ? 'Nouvelle tâche' : 'New task'],
    [['G', 'H'], fr ? 'Aller à l’accueil' : 'Go to home'],
    [['G', 'T'], fr ? 'Aller aux tâches' : 'Go to tasks'],
    [['G', 'N'], fr ? 'Aller aux notes' : 'Go to notes'],
    [['G', 'M'], fr ? 'Aller aux messages' : 'Go to messages'],
    [['G', 'C'], fr ? 'Aller au calendrier' : 'Go to calendar'],
    [['['], fr ? 'Réduire / ouvrir le menu' : 'Toggle sidebar'],
    [['?'], fr ? 'Afficher cette aide' : 'Show this help'],
  ]
  return (
    <Dialog open={open} onClose={onClose} title={t('shell.keyboard')} size="sm">
      <ul className="space-y-2.5">
        {rows.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between text-sm"><span className="text-text-2">{label}</span><span className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span></li>
        ))}
      </ul>
    </Dialog>
  )
}
