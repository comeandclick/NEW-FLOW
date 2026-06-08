import { getSupabaseClient } from '@/lib/supabase/client'
import type { InsertEvent } from '@/types/database'

const supabase = () => getSupabaseClient()

export const calendarService = {
  async getEvents(workspaceId: string, from: string, to: string) {
    const { data, error } = await supabase()
      .from('events')
      .select(`
        *,
        task:tasks(id, title, status, priority),
        meeting:meetings(id, title, status),
        note:notes(id, title),
        attendees:event_attendees(
          status,
          profile:profiles(id, full_name, avatar_url)
        )
      `)
      .eq('workspace_id', workspaceId)
      .gte('start_at', from)
      .lte('end_at', to)
      .order('start_at', { ascending: true })
    if (error) throw error
    return data
  },

  async create(event: InsertEvent) {
    const { data, error } = await supabase()
      .from('events')
      .insert(event)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<InsertEvent>) {
    const { data, error } = await supabase()
      .from('events')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase().from('events').delete().eq('id', id)
    if (error) throw error
  },

  async addAttendee(eventId: string, userId: string, status: 'pending' | 'accepted' | 'declined' = 'pending') {
    const { error } = await supabase()
      .from('event_attendees')
      .insert({ event_id: eventId, user_id: userId, status })
    if (error && !error.message.includes('unique')) throw error
  },
}
