import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** POST /api/social/upload — upload a media file to the social bucket */
export async function POST(req: NextRequest) {
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const ws = formData.get('ws') as string | null

  if (!file || !ws) return NextResponse.json({ error: 'file and ws required' }, { status: 400 })

  const maxBytes = 100 * 1024 * 1024
  if (file.size > maxBytes) return NextResponse.json({ error: 'Fichier trop volumineux (max 100 Mo)' }, { status: 413 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `posts/${ws}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const admin = getAdminDb()
  const { error } = await admin.storage.from('social').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('social').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
