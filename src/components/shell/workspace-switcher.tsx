'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Menu, MenuItem, MenuSeparator, MenuLabel } from '@/components/ui/overlay'
import { Logo } from '@/components/ui/logo'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const t = useT()
  const { userId } = useSession()
  const { ws } = useWorkspace()
  const { data } = useLive<any>('workspace_members', { select: 'workspace:workspaces(id,name,slug)', eq: { user_id: userId ?? undefined }, enabled: !!userId, live: false })
  return (
    <Menu width={240} trigger={({ toggle }) => (
      <button onClick={toggle} aria-label={t('shell.switchWorkspace')} className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-2">
        <Logo size={26} />
        {!collapsed && <><span className="min-w-0 flex-1 truncate text-sm font-semibold">{ws.name}</span><ChevronsUpDown className="size-3.5 text-text-3" /></>}
      </button>
    )}>
      {(close) => (
        <>
          <MenuLabel>{t('shell.switchWorkspace')}</MenuLabel>
          {data.map((m: any) => m.workspace && (
            <Link key={m.workspace.id} href={`/app/${m.workspace.slug}`} onClick={close}>
              <MenuItem><span className="flex items-center justify-between">{m.workspace.name}{m.workspace.id === ws.id && <Check className="size-3.5 text-accent-ink" />}</span></MenuItem>
            </Link>
          ))}
          <MenuSeparator />
          <Link href="/app?new=1" onClick={close}><MenuItem icon={<Plus className="size-4" />}>{t('shell.createWorkspace')}</MenuItem></Link>
        </>
      )}
    </Menu>
  )
}
