 
import { DEMO_COOKIE, DEMO_STORAGE_KEY, DEMO_USER_ID } from './constants'
import { createMockClient, type DemoDB, type MockClient } from './mock-client'
import { createSeed } from './seed'

const MAX_AGE = 60 * 60 * 24 * 7

export function isDemoBrowser(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((c) => c === `${DEMO_COOKIE}=1`)
}

let browserClient: MockClient | null = null

function loadDb(): DemoDB {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDB
      if (parsed?.profiles?.length && parsed?.workspaces?.length) return parsed
    }
  } catch {}
  return createSeed()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveDb(db: DemoDB) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db)) } catch {}
  }, 200)
}

export function getBrowserDemoClient(): MockClient {
  if (!browserClient) {
    browserClient = createMockClient(loadDb(), {
      user: { id: DEMO_USER_ID },
      persist: saveDb,
      onSignOut: () => exitDemo(false),
    })
  }
  return browserClient
}

export function startDemo(fresh = false) {
  if (fresh) { try { window.localStorage.removeItem(DEMO_STORAGE_KEY) } catch {} }
  document.cookie = `${DEMO_COOKIE}=1; path=/; max-age=${MAX_AGE}; samesite=lax`
  browserClient = null
}

export function exitDemo(reset = true) {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`
  if (reset) { try { window.localStorage.removeItem(DEMO_STORAGE_KEY) } catch {} }
  browserClient = null
}
