import type { SupabaseClient } from '@supabase/supabase-js'

interface NotifyPayload {
  title: string
  body?: string
  url?: string
  type?: string
}

/** Send a Flow notification to all active workspace members via push_subscriptions. */
export async function notifyWorkspaceMembers(admin: SupabaseClient, workspaceId: string, payload: NotifyPayload) {
  const { data: members } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)

  if (!members?.length) return

  const userIds = members.map((m) => m.user_id as string)

  await admin.from('notifications').insert(
    userIds.map((uid) => ({
      workspace_id: workspaceId,
      user_id: uid,
      type: payload.type ?? 'social',
      title: payload.title,
      body: payload.body ?? null,
      url: payload.url ?? null,
      read: false,
    }))
  )
}

/** Schedule a 5-minute-before notification for a post. Stored as a notification with future delivery time. */
export async function schedulePreNotification(admin: SupabaseClient, workspaceId: string, postId: string, scheduledAt: Date, title: string) {
  const fiveMin = new Date(scheduledAt.getTime() - 5 * 60 * 1000)
  const { data: members } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId)
  if (!members?.length) return

  await admin.from('notifications').insert(
    members.map((m) => ({
      workspace_id: workspaceId,
      user_id: m.user_id,
      type: 'social_pre',
      title: 'Post dans 5 min',
      body: title.slice(0, 80),
      url: `/social/calendar`,
      read: false,
      created_at: fiveMin.toISOString(),
    }))
  )
}
