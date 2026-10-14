'use client'
 
import Link from 'next/link'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Menu, MenuItem, MenuSeparator, MenuLabel } from '@/components/ui/overlay'
import { Logo } from '@/components/ui/logo'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const t = useT()
  const { userId } = useSession()
  const { ws } = useWorkspace()
  const { data } = useLive<any>('workspace_members', { select: 'workspace:workspaces(id,name,slug)', eq: { user_id: userId ?? undefined }, enabled: !!userId, live: false })
  return (
    <Menu width={240} trigger={({ toggle }) => (
      <button onClick={toggle} aria-label={t('shell.switchWorkspace')} className={cn('flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-text/5', collapsed && 'justify-center')}>
        {/* pastille carrée à l'initiale, comme le sélecteur d'espace de la référence 21st.dev */}
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-text text-[13px] font-semibold text-bg">{ws.name.trim().charAt(0).toUpperCase() || <Logo size={18} />}</span>
        {!collapsed && <><span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-[13px] font-semibold">{ws.name}</span><span className="block truncate text-[11px] text-text-3">Flow</span></span><ChevronsUpDown className="size-3.5 shrink-0 text-text-3" /></>}
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
