'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getDb } from '@/lib/supabase/client'
import { exitDemo, isDemoBrowser } from '@/lib/demo/runtime'
import type { Profile } from '@/lib/types'

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
    const { data } = await getDb().from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile((data as Profile) ?? null)
  }, [])

  useEffect(() => {
    const demo = isDemoBrowser()
    setIsDemo(demo)
    const db = getDb()
    let alive = true
    db.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      const id = data.session?.user.id ?? null
      setUserId(id)
      if (id) await loadProfile(id)
      setLoading(false)
    })
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      const id = session?.user.id ?? null
      setUserId(id)
      if (id) void loadProfile(id)
      else setProfile(null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signOut = useCallback(async () => {
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
