import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = () => getSupabaseClient()

export const notificationsService = {
  async getForUser(userId: string, limit = 30) {
    const { data, error } = await supabase()
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },

  async markRead(id: string) {
    const { error } = await supabase()
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
    if (error) throw error
  },

  async markAllRead(userId: string) {
    const { error } = await supabase()
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (error) throw error
  },

  async create(notification: {
    user_id: string
    workspace_id?: string
    type: string
    title: string
    body?: string
    action_url?: string
    task_id?: string
    message_id?: string
    meeting_id?: string
  }) {
    const { error } = await supabase().from('notifications').insert(notification)
    if (error) throw error
  },

  async notifyTaskAssigned(taskId: string, assigneeId: string, workspaceId: string, taskTitle: string, actorName: string) {
    await notificationsService.create({
      user_id: assigneeId,
      workspace_id: workspaceId,
      type: 'task_assigned',
      title: `Task assigned to you`,
      body: `${actorName} assigned "${taskTitle}" to you`,
      action_url: `/tasks/${taskId}`,
      task_id: taskId,
    })
  },

  async notifyMention(userId: string, workspaceId: string, messageId: string, actorName: string, conversationName: string) {
    await notificationsService.create({
      user_id: userId,
      workspace_id: workspaceId,
      type: 'message_mention',
      title: `You were mentioned`,
      body: `${actorName} mentioned you in ${conversationName}`,
      action_url: `/messages/${messageId}`,
      message_id: messageId,
    })
  },
}
