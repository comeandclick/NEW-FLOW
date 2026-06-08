import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Notification } from '@/types/database'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number

  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Notification) => void
  markRead: (id: string) => void
  markAllRead: () => void
  removeNotification: (id: string) => void
}

export const useNotificationStore = create<NotificationState>()(
  immer((set) => ({
    notifications: [],
    unreadCount: 0,

    setNotifications: (notifications) =>
      set((state) => {
        state.notifications = notifications
        state.unreadCount = notifications.filter((n) => !n.is_read).length
      }),

    addNotification: (notification) =>
      set((state) => {
        state.notifications.unshift(notification)
        if (!notification.is_read) state.unreadCount++
      }),

    markRead: (id) =>
      set((state) => {
        const n = state.notifications.find((n) => n.id === id)
        if (n && !n.is_read) {
          n.is_read = true
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }
      }),

    markAllRead: () =>
      set((state) => {
        state.notifications.forEach((n) => { n.is_read = true })
        state.unreadCount = 0
      }),

    removeNotification: (id) =>
      set((state) => {
        const n = state.notifications.find((n) => n.id === id)
        if (n && !n.is_read) state.unreadCount = Math.max(0, state.unreadCount - 1)
        state.notifications = state.notifications.filter((n) => n.id !== id)
      }),
  }))
)
