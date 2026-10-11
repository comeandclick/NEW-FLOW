'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getDb } from '@/lib/supabase/client'
import { exitDemo, isDemoBrowser } from '@/lib/demo/runtime'
import type { Profile } from '@/lib/types'
import { clearOfflineData, readIdentity, writeIdentity } from '@/lib/offline'

type SessionCtx = {
  userId: string | null
  profile: Profile | null
  loading: boolean
  isDemo: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
}
const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)

  const loadProfile = useCallback(async (id: string) => {
    const { data, error } = await getDb().from('profiles').select('*').eq('id', id).maybeSingle()
    if (data) { setProfile(data as Profile); if (!isDemoBrowser()) writeIdentity({ id, profile: data }) }
    else if (error) { const ident = readIdentity(); if (ident?.id === id) setProfile(ident.profile as Profile) } // offline: last known profile
    else setProfile(null)
  }, [])

  useEffect(() => {
    const demo = isDemoBrowser()
    setIsDemo(demo)
    const db = getDb()
    let alive = true
    db.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      let id = data.session?.user.id ?? null
      if (!id && !demo && !navigator.onLine) {
        // No connection and the token could not be refreshed: open with the last signed-in identity (read-only data from the cache).
        const ident = readIdentity()
        if (ident) { id = ident.id; setProfile(ident.profile as Profile) }
      }
      setUserId(id)
      if (id) await loadProfile(id)
      setLoading(false)
    }).catch(() => {
      const ident = !demo ? readIdentity() : null
      if (ident && alive) { setUserId(ident.id); setProfile(ident.profile as Profile) }
      if (alive) setLoading(false)
    })
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      const id = session?.user.id ?? null
      if (!id && typeof navigator !== 'undefined' && !navigator.onLine && _e !== 'SIGNED_OUT') return // a failed refresh while offline is not a sign-out
      setUserId(id)
      if (id) void loadProfile(id)
      else setProfile(null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    clearOfflineData()
    if (isDemoBrowser()) exitDemo(false)
    else await getDb().auth.signOut()
    window.location.href = '/'
  }, [])

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!userId) return
    await getDb().from('profiles').update(patch).eq('id', userId)
    await loadProfile(userId)
  }, [userId, loadProfile])

  const value = useMemo(
    () => ({ userId, profile, loading, isDemo, signOut, refreshProfile: async () => { if (userId) await loadProfile(userId) }, updateProfile }),
    [userId, profile, loading, isDemo, signOut, loadProfile, updateProfile],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSession outside <SessionProvider>')
  return c
}
