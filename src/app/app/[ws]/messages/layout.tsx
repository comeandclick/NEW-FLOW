'use client'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ConversationList } from '@/components/chat/conversation-list'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { cn } from '@/lib/utils'

export default function MessagesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { ws } = useWorkspace()
  const inChat = pathname !== `/app/${ws.slug}/messages`
  return (
    <div className="flex h-full">
      <aside className={cn('w-full shrink-0 border-r border-border bg-bg-subtle md:block md:w-[280px]', inChat ? 'hidden' : 'block')}><ConversationList /></aside>
      <section className={cn('min-w-0 flex-1', inChat ? 'block' : 'hidden md:block')}>{children}</section>
    </div>
  )
}
