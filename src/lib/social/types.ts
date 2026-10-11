export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin'
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
export type TemplateType = 'cours' | 'quiz' | 'dialogue' | 'expression' | 'custom'
export type Recurrence = 'daily' | 'every2days' | 'weekly'
export type VoiceOption = 'ar' | 'fr' | 'ar+fr'

export interface SocialAccount {
  id: string
  workspace_id: string
  platform: Platform
  external_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  followers: number
  expires_at: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SocialPost {
  id: string
  workspace_id: string
  title: string | null
  caption: string
  media_urls: string[]
  platforms: Platform[]
  account_ids: string[]
  status: PostStatus
  scheduled_at: string | null
  published_at: string | null
  publish_results: Record<string, { ok: boolean; url?: string; error?: string }> | null
  series_id: string | null
  template_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TemplatePrompt {
  series?: string
  format?: string
  next: string[]
}

export interface SocialTemplate {
  id: string
  workspace_id: string | null
  name: string
  description: string | null
  type: TemplateType
  voice_options: VoiceOption[]
  sfx: boolean
  duration_sec: number | null
  ratio: string
  demo_video_url: string | null
  prompt_template: TemplatePrompt | null
  is_demo: boolean
  is_global: boolean
  sort_order: number
  created_by: string | null
  created_at: string
}

export interface SocialSeries {
  id: string
  workspace_id: string
  name: string
  template_id: string | null
  account_ids: string[]
  platforms: Platform[]
  recurrence: Recurrence
  time_of_day: string
  timezone: string
  next_at: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export const PLATFORM_LIMITS: Record<Platform, { caption: number; requiresMedia: boolean }> = {
  instagram: { caption: 2200, requiresMedia: true },
  facebook: { caption: 63206, requiresMedia: false },
  tiktok: { caption: 2200, requiresMedia: true },
  linkedin: { caption: 3000, requiresMedia: false },
}

export const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#000000',
  linkedin: '#0A66C2',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
}

/** Check whether the env vars for a platform OAuth are configured. */
export function platformConfigured(platform: Platform): boolean {
  if (typeof process === 'undefined') return true
  switch (platform) {
    case 'instagram':
    case 'facebook':
      return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
    case 'tiktok':
      return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
    case 'linkedin':
      return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
  }
}
