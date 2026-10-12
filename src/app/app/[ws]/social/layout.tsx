'use client'
import type { ReactNode } from 'react'
import { HubTabs } from '@/components/shell/hub-tabs'

export default function SocialLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="shrink-0 px-4 pt-3 md:px-6 md:pt-4">
        <HubTabs hub="social" />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
