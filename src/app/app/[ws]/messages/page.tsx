'use client'
import { MessageSquare } from 'lucide-react'
import { EmptyState } from '@/components/ui/misc'
import { useT } from '@/i18n/provider'

export default function Page() {
  const t = useT()
  return <div className="flex h-full items-center justify-center"><EmptyState icon={<MessageSquare className="size-5" />} title={t('msg.empty')} hint={t('msg.emptyHint')} /></div>
}
