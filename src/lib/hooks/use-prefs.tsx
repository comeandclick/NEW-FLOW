'use client'
import { useCallback, useEffect, useMemo } from 'react'
import { useSession } from '@/lib/hooks/use-session'
import { mergePrefs, type Prefs } from '@/lib/prefs'

type Patch = { [K in keyof Prefs]?: K extends 'notif' ? { [N in keyof Prefs['notif']]?: Prefs['notif'][N] extends object ? Partial<Prefs['notif'][N]> : Prefs['notif'][N] } : Prefs[K] }

/** The signed-in user's preferences (defaults filled in) and a setter that persists to the profile. */
export function usePrefs() {
  const { profile, updateProfile } = useSession()
  const prefs = useMemo(() => mergePrefs(profile?.preferences?.ui), [profile?.preferences])

  const update = useCallback(async (patch: Patch) => {
    const next: Prefs = { ...prefs, ...patch, notif: { ...prefs.notif, ...patch.notif, quiet: { ...prefs.notif.quiet, ...patch.notif?.quiet } } } as Prefs
    await updateProfile({ preferences: { ...(profile?.preferences ?? {}), ui: next } })
  }, [prefs, profile?.preferences, updateProfile])

  return { prefs, update }
}

/** Mirrors the visual preferences onto <html> (and caches them so the next load paints correctly). */
export function PrefsApplier() {
  const { prefs } = usePrefs()
  const { profile } = useSession()
  useEffect(() => {
    if (!profile) return
    const el = document.documentElement
    if (prefs.accent === 'indigo') delete el.dataset.accent; else el.dataset.accent = prefs.accent
    if (prefs.density === 'compact') el.dataset.density = 'compact'; else delete el.dataset.density
    if (prefs.reduceMotion) el.dataset.motion = 'reduce'; else delete el.dataset.motion
    try { localStorage.setItem('flow_ui', JSON.stringify({ accent: prefs.accent, density: prefs.density, reduceMotion: prefs.reduceMotion })) } catch {}
  }, [profile, prefs.accent, prefs.density, prefs.reduceMotion])
  return null
}
