'use client'

import { useEffect } from 'react'
import { useNotificationStore } from '@/stores/notificationStore'
import { notificationsService } from '@/services/notifications.service'
import { subscribeToNotifications } from '@/lib/realtime/subscriptions'

export function useNotifications(userId: string) {
  const notifications = useNotificationStore(s => s.notifications)
  const unreadCount = useNotificationStore(s => s.unreadCount)
  const setNotifications = useNotificationStore(s => s.setNotifications)
  const markRead = useNotificationStore(s => s.markRead)
  const markAllRead = useNotificationStore(s => s.markAllRead)

  useEffect(() => {
    if (!userId) return
    notificationsService
      .getForUser(userId)
      .then(setNotifications)
      .catch(console.error)

    const unsub = subscribeToNotifications(userId)
    return unsub
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkRead = async (id: string) => {
    markRead(id)
    await notificationsService.markRead(id)
  }

  const handleMarkAllRead = async () => {
    markAllRead()
    await notificationsService.markAllRead(userId)
  }

  return { notifications, unreadCount, markRead: handleMarkRead, markAllRead: handleMarkAllRead }
}
