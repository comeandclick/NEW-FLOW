'use client'
 
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { FileText, CheckSquare, Plus, Search, Users, Moon, Languages, LogOut } from 'lucide-react'
import { useI18n } from '@/i18n/provider'
import { useTheme } from '@/components/providers/theme'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { HUBS, NAV, NAV_FOOTER } from './nav-items'
import { Kbd } from '@/components/ui/misc'

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { t, locale, setLocale } = useI18n()
  const { ws } = useWorkspace()
  const { signOut } = useSession()
  const { resolved, setPref } = useTheme()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ tasks: any[]; notes: any[]; contacts: any[] }>({ tasks: [], notes: [], contacts: [] })
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => { if (!open) setQ('') }, [open])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults({ tasks: [], notes: [], contacts: [] }); return }
    let alive = true
    const id = setTimeout(async () => {
      const db = getDb()
      const like = `%${term}%`
      const [tasks, notes, contacts] = await Promise.all([
        db.from('tasks').select('id,title,status').eq('workspace_id', ws.id).is('deleted_at', null).ilike('title', like).limit(5),
        db.from('notes').select('id,title,icon,kind').eq('workspace_id', ws.id).is('deleted_at', null).ilike('title', like).limit(5),
        db.from('crm_contacts').select('id,name,company').eq('workspace_id', ws.id).is('deleted_at', null).ilike('name', like).limit(4),
      ])
      if (alive) setResults({ tasks: tasks.data ?? [], notes: notes.data ?? [], contacts: contacts.data ?? [] })
    }, 160)
    return () => { alive = false; clearTimeout(id) }
  }, [q, ws.id])

  const go = (path: string) => { setOpen(false); router.push(`/app/${ws.slug}${path}`) }
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-2 aria-selected:bg-accent-soft aria-selected:text-accent-ink'
  const heading = '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-3'

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[110] flex items-start justify-center px-3 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-lg">
            <Command label={t('shell.search')} shouldFilter={q.trim().length < 2 || true} loop>
              <div className="flex items-center gap-2.5 border-b border-border px-4">
                <Search className="size-4 text-text-3" />
                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={t('shell.search')} className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-text-3" />
                <Kbd>esc</Kbd>
              </div>
              <Command.List className={`max-h-[55dvh] overflow-y-auto p-2 ${heading}`}>
                <Command.Empty className="px-4 py-10 text-center text-sm text-text-3">{t('shell.noResults')}</Command.Empty>

                {results.tasks.length + results.notes.length + results.contacts.length > 0 && (
                  <Command.Group heading={t('shell.results')}>
                    {results.tasks.map((r) => <Command.Item key={r.id} value={`task ${r.title} ${r.id}`} className={item} onSelect={() => go(`/tasks?open=${r.id}`)}><CheckSquare className="size-4" />{r.title}</Command.Item>)}
                    {results.notes.map((r) => <Command.Item key={r.id} value={`note ${r.title} ${r.id}`} className={item} onSelect={() => go(`/notes/${r.id}`)}><FileText className="size-4" />{r.icon ? `${r.icon} ` : ''}{r.title || '—'}</Command.Item>)}
                    {results.contacts.map((r) => <Command.Item key={r.id} value={`contact ${r.name} ${r.id}`} className={item} onSelect={() => go('/crm')}><Users className="size-4" />{r.name}{r.company ? ` · ${r.company}` : ''}</Command.Item>)}
                  </Command.Group>
                )}

                <Command.Group heading={t('shell.actions')}>
                  <Command.Item className={item} value="new task nouvelle tâche" onSelect={() => go('/tasks?new=1')}><Plus className="size-4" />{t('shell.newTask')}</Command.Item>
                  <Command.Item className={item} value="new note nouvelle note" onSelect={() => go('/notes?new=1')}><Plus className="size-4" />{t('shell.newNote')}</Command.Item>
                  <Command.Item className={item} value="new event nouvel événement" onSelect={() => go('/calendar?new=1')}><Plus className="size-4" />{t('shell.newEvent')}</Command.Item>
                  <Command.Item className={item} value="theme thème sombre clair dark light" onSelect={() => { setPref(resolved === 'dark' ? 'light' : 'dark'); setOpen(false) }}><Moon className="size-4" />{t('common.theme')}</Command.Item>
                  <Command.Item className={item} value="language langue français english" onSelect={() => { setLocale(locale === 'fr' ? 'en' : 'fr'); setOpen(false) }}><Languages className="size-4" />{t('common.language')} → {locale === 'fr' ? 'English' : 'Français'}</Command.Item>
                  <Command.Item className={item} value="sign out déconnexion logout" onSelect={() => signOut()}><LogOut className="size-4" />{t('common.signOut')}</Command.Item>
                </Command.Group>

                <Command.Group heading={t('shell.goTo')}>
                  {[...new Map([...NAV.flatMap((g) => g.items), ...NAV_FOOTER, ...Object.values(HUBS).flat(), { href: '/ai', label: 'nav.ai' as const }].map((n) => [n.href, n])).values()].map((n) => (
                    <Command.Item key={n.href} className={item} value={`go ${t(n.label)} ${n.href}`} onSelect={() => go(n.href)}><Search className="size-4" />{t(n.label)}</Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
