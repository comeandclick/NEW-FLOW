'use client'
import { useCallback, useMemo } from 'react'
import { getDb } from '@/lib/supabase/client'
import { readPerso, type Perso } from '@/lib/perso'
import { useSession } from './use-session'

/** The signed-in user's personal notes/events. Writes re-read the latest profile first so concurrent edits are not lost. */
export function usePerso() {
  const { userId, profile, updateProfile } = useSession()
  const perso = useMemo(() => readPerso(profile?.preferences), [profile?.preferences])
  const save = useCallback(async (change: (p: Perso) => Perso) => {
    if (!userId) return false
    const { data, error } = await getDb().from('profiles').select('preferences').eq('id', userId).single()
    if (error || !data) return false
    const prefs = ((data as { preferences?: Record<string, unknown> }).preferences ?? {}) as Record<string, unknown>
    try { await updateProfile({ preferences: { ...prefs, perso: change(readPerso(prefs)) } }); return true } catch { return false }
  }, [userId, updateProfile])
  return { perso, save }
}
