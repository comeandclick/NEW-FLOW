'use client'
import { getDb } from '@/lib/supabase/client'
import { uid } from '@/lib/utils'

const cache = new Map<string, { url: string; exp: number }>()

export async function uploadToBucket(bucket: 'files' | 'voice' | 'avatars', folder: string, file: Blob, name: string) {
  const safe = name.replace(/[^\w.\-]+/g, '_')
  const path = `${folder}/${uid().slice(0, 8)}-${safe}`
  const { error } = await getDb().storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

export async function signedUrl(bucket: 'files' | 'voice', path: string): Promise<string> {
  const key = `${bucket}/${path}`
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await getDb().storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data) return ''
  cache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 })
  return data.signedUrl
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/')
