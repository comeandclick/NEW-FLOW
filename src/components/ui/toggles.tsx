'use client'
import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePref } from '@/components/providers/theme'
import { useI18n } from '@/i18n/provider'
import { Button } from './button'
import { Menu, MenuItem } from './overlay'

export function ThemeToggle({ size = 'icon' }: { size?: 'icon' | 'sm' }) {
  const { pref, resolved, setPref } = useTheme()
  const { t } = useI18n()
  const items: { v: ThemePref; icon: typeof Sun; label: string }[] = [
    { v: 'light', icon: Sun, label: t('common.theme.light') },
    { v: 'dark', icon: Moon, label: t('common.theme.dark') },
    { v: 'system', icon: Monitor, label: t('common.theme.system') },
  ]
  return (
    <Menu align="end" width={168} trigger={({ toggle }) => (
      <Button variant="ghost" size={size} onClick={toggle} aria-label={t('common.theme')}>
        {resolved === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </Button>
    )}>
      {(close) => items.map((it) => (
        <MenuItem key={it.v} icon={<it.icon className="size-4" />} onClick={() => { setPref(it.v); close() }}>
          <span className="flex items-center justify-between">{it.label}{pref === it.v && <Check className="size-3.5 text-accent" />}</span>
        </MenuItem>
      ))}
    </Menu>
  )
}

export function LanguageToggle({ size = 'icon' }: { size?: 'icon' | 'sm' }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <Menu align="end" width={150} trigger={({ toggle }) => (
      <Button variant="ghost" size={size} onClick={toggle} aria-label={t('common.language')}>
        <Languages className="size-4" />
        {size === 'sm' && <span className="uppercase">{locale}</span>}
      </Button>
    )}>
      {(close) => (['fr', 'en'] as const).map((l) => (
        <MenuItem key={l} onClick={() => { setLocale(l); close() }}>
          <span className="flex items-center justify-between">{l === 'fr' ? 'Français' : 'English'}{locale === l && <Check className="size-3.5 text-accent" />}</span>
        </MenuItem>
      ))}
    </Menu>
  )
}
