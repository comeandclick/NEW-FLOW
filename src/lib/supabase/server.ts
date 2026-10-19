import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

/**
 * Client Supabase de la requête. Navigateur : session lue dans les cookies.
 * App mobile Flow Workspace : pas de cookie, jeton de session envoyé en « Authorization: Bearer <access_token> » ;
 * les droits restent ceux de l'utilisateur (RLS), getUser() vérifie le jeton auprès de Supabase.
 */
export async function getServerDb() {
  const bearer = (await headers()).get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer && !bearer.startsWith('flw_')) {
    const c = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const getUser = c.auth.getUser.bind(c.auth)
    c.auth.getUser = ((jwt?: string) => getUser(jwt ?? bearer)) as typeof c.auth.getUser
    return c as unknown as ReturnType<typeof cookieClient>
  }
  return cookieClient(await cookies())
}

function cookieClient(store: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {}
      },
    },
  })
}

/** Service-role client. NEVER import from client code. */
export function getAdminDb() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
