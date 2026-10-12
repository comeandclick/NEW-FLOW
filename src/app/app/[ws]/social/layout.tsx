'use client'
import type { ReactNode } from 'react'
import { HubTabs } from '@/components/shell/hub-tabs'

export default function SocialLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 pt-4 md:px-6 md:pt-6">
        <HubTabs hub="social" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
