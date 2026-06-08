import { getSupabaseClient } from '@/lib/supabase/client'
import type { InsertMessage } from '@/types/database'

const supabase = () => getSupabaseClient()

export const messagesService = {
  async getConversations(workspaceId: string, userId: string) {
    const { data, error } = await supabase()
      .from('conversations')
      .select(`
        *,
        members:conversation_members!inner(
          user_id,
          last_read_at,
          profile:profiles(id, full_name, avatar_url, email)
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
    if (error) throw error

    // Filter: only conversations user belongs to
    type ConvWithMembers = typeof data extends (infer T)[] | null ? T & { members: { user_id: string }[] } : never
    return (data as unknown as ConvWithMembers[])?.filter((c) =>
      c.members.some((m) => m.user_id === userId)
    )
  },

  async getMessages(conversationId: string, limit = 50, before?: string) {
    let query = supabase()
      .from('messages')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url, email),
        reactions(*),
        file_links(*, file:files(*))
      `)
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (before) query = query.lt('created_at', before)

    const { data, error } = await query
    if (error) throw error
    return data?.reverse() ?? []
  },

  async getThreadReplies(parentMessageId: string) {
    const { data, error } = await supabase()
      .from('messages')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url, email),
        reactions(*)
      `)
      .eq('parent_id', parentMessageId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  },

  async send(message: InsertMessage) {
    const { data, error } = await supabase()
      .from('messages')
      .insert(message)
      .select(`
        *,
        user:profiles(id, full_name, avatar_url, email)
      `)
      .single()
    if (error) throw error

    // Update conversation updated_at
    await supabase()
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', message.conversation_id)

    return data
  },

  async edit(id: string, content: string) {
    const { data, error } = await supabase()
      .from('messages')
      .update({ content, is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase()
      .from('messages')
      .update({ is_deleted: true, content: null })
      .eq('id', id)
    if (error) throw error
  },

  async addReaction(messageId: string, userId: string, emoji: string) {
    const { error } = await supabase()
      .from('reactions')
      .insert({ message_id: messageId, user_id: userId, emoji })
    if (error && !error.message.includes('unique')) throw error
  },

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const { error } = await supabase()
      .from('reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
    if (error) throw error
  },

  async createChannel(workspaceId: string, userId: string, name: string, isPrivate = false, projectId?: string) {
    const { data: conversation, error } = await supabase()
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        type: 'channel',
        name,
        is_private: isPrivate,
        created_by: userId,
        project_id: projectId ?? null,
      })
      .select()
      .single()
    if (error) throw error

    // Auto-add creator as member
    await supabase().from('conversation_members').insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: 'owner',
    })

    return conversation
  },

  async createDM(workspaceId: string, userIds: string[]) {
    const type = userIds.length === 2 ? 'dm' : 'group_dm'
    const { data: conversation, error } = await supabase()
      .from('conversations')
      .insert({ workspace_id: workspaceId, type, created_by: userIds[0] })
      .select()
      .single()
    if (error) throw error

    await supabase().from('conversation_members').insert(
      userIds.map((uid) => ({ conversation_id: conversation.id, user_id: uid }))
    )

    return conversation
  },

  async markRead(conversationId: string, userId: string) {
    const { error } = await supabase()
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
    if (error) throw error
  },
}
