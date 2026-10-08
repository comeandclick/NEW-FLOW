import type { Metadata } from 'next'
import Link from 'next/link'
import { Bot, CalendarDays, CheckSquare, Clock, FileText, FolderOpen, MessageSquare, Shield, Target, Users, Video, Workflow } from 'lucide-react'
import { getT } from '@/i18n/server'
import { Button } from '@/components/ui/button'
import { Container, PageIntro, Reveal } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Fonctionnalités · Features' }

export default async function Features() {
  const { t } = await getT()
  const mods = [
    [CheckSquare, 's.mod.tasks', 's.mod.tasks.d'], [FileText, 's.mod.notes', 's.mod.notes.d'], [CalendarDays, 's.mod.cal', 's.mod.cal.d'], [MessageSquare, 's.mod.chat', 's.mod.chat.d'],
    [Video, 's.mod.calls', 's.mod.calls.d'], [FolderOpen, 's.mod.files', 's.mod.files.d'], [Target, 's.mod.goals', 's.mod.goals.d'], [Users, 's.mod.crm', 's.mod.crm.d'],
    [Clock, 's.mod.focus', 's.mod.focus.d'], [Bot, 's.mod.ai', 's.mod.ai.d'], [Workflow, 's.mod.auto', 's.mod.auto.d'], [Shield, 's.mod.admin', 's.mod.admin.d'],
  ] as const
  return (
    <>
      <PageIntro title={t('s.features.title')} sub={t('s.features.sub')} />
      <Container className="pb-24">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {mods.map(([Icon, title, desc], i) => (
            <Reveal key={title} delay={(i % 3) * 0.04} className="bg-bg">
              <div className="h-full p-6"><Icon className="size-5 text-text-3" strokeWidth={1.6} /><h2 className="mt-4 text-[15px] font-semibold">{t(title)}</h2><p className="mt-2 text-[14px] leading-relaxed text-text-2">{t(desc)}</p></div>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-4"><Link href="/demo"><Button variant="primary" size="lg">{t('s.cta.primary')}</Button></Link><Link href="/register" className="text-[14px] font-medium hover:text-accent">{t('s.cta.secondary')} →</Link></div>
      </Container>
    </>
  )
}
