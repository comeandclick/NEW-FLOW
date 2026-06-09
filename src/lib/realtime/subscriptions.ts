import { getSupabaseClient } from '@/lib/supabase/client'
import { useTaskStore } from '@/stores/taskStore'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Task, Notification } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

const supabase = () => getSupabaseClient()

let taskChannel: RealtimeChannel | null = null
let notificationChannel: RealtimeChannel | null = null
let messageChannels: Map<string, RealtimeChannel> = new Map()

export function subscribeToTasks(workspaceId: string) {
  if (taskChannel) taskChannel.unsubscribe()

  taskChannel = supabase()
    .channel(`tasks:${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useTaskStore.getState().handleRealtimeEvent(payload as any)
      }
    )
    .subscribe()

  return () => { taskChannel?.unsubscribe(); taskChannel = null }
}

export function subscribeToNotifications(userId: string) {
  if (notificationChannel) notificationChannel.unsubscribe()

  notificationChannel = supabase()
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        useNotificationStore.getState().addNotification(payload.new as Notification)
      }
    )
    .subscribe()

  return () => { notificationChannel?.unsubscribe(); notificationChannel = null }
}

export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (message: unknown) => void,
  onUpdateMessage?: (message: unknown) => void,
  onTyping?: (payload: { userId: string; name: string; typing: boolean }) => void
) {
  // Always unsubscribe stale channel — stale callback causes missed messages on re-mount
  const existing = messageChannels.get(conversationId)
  if (existing) {
    existing.unsubscribe()
    messageChannels.delete(conversationId)
  }

  const channel = supabase()
    .channel(`messages:${conversationId}`, { config: { broadcast: { self: false } } })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => { onNewMessage(payload.new) }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => { if (onUpdateMessage) onUpdateMessage(payload.new) }
    )
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (onTyping) onTyping(payload as { userId: string; name: string; typing: boolean })
    })
    .subscribe()

  messageChannels.set(conversationId, channel)

  return () => {
    channel.unsubscribe()
    messageChannels.delete(conversationId)
  }
}

export function broadcastTyping(conversationId: string, userId: string, name: string, typing: boolean) {
  const channel = messageChannels.get(conversationId)
  if (channel) {
    channel.send({ type: 'broadcast', event: 'typing', payload: { userId, name, typing } })
  }
}

export function subscribeToPresence(
  workspaceId: string,
  userId: string,
  onPresenceChange: (presences: Record<string, unknown[]>) => void
) {
  const channel = supabase()
    .channel(`presence:${workspaceId}`)
    .on('presence', { event: 'sync' }, () => {
      onPresenceChange(channel.presenceState())
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: userId, online_at: new Date().toISOString() })
      }
    })

  return () => channel.unsubscribe()
}

export function unsubscribeAll() {
  taskChannel?.unsubscribe()
  notificationChannel?.unsubscribe()
  messageChannels.forEach((ch) => ch.unsubscribe())
  taskChannel = null
  notificationChannel = null
  messageChannels.clear()
}
