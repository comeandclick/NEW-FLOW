import { getSupabaseClient } from '@/lib/supabase/client'
import type { Note, InsertNote } from '@/types/database'

const supabase = () => getSupabaseClient()

export const notesService = {
  async getByWorkspace(workspaceId: string, projectId?: string) {
    let query = supabase()
      .from('notes')
      .select(`
        *,
        created_by_profile:profiles!notes_created_by_fkey(id, full_name, avatar_url)
      `)
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabase()
      .from('notes')
      .select(`
        *,
        created_by_profile:profiles!notes_created_by_fkey(id, full_name, avatar_url),
        note_links!note_links_source_note_id_fkey(
          id, target_note_id, target_task_id,
          target_note:notes!note_links_target_note_id_fkey(id, title, icon),
          target_task:tasks!note_links_target_task_id_fkey(id, title, status)
        )
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create(note: InsertNote) {
    const { data, error } = await supabase()
      .from('notes')
      .insert(note)
      .select()
      .single()
    if (error) throw error

    await supabase().from('activity_logs').insert({
      workspace_id: note.workspace_id,
      user_id: note.created_by ?? null,
      action: 'note.created',
      entity_type: 'note',
      entity_id: data.id,
      metadata: { title: note.title ?? 'Untitled' },
    })

    return data
  },

  async update(id: string, updates: Partial<Note>) {
    const { data, error } = await supabase()
      .from('notes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase().from('notes').delete().eq('id', id)
    if (error) throw error
  },

  async linkToNote(sourceNoteId: string, targetNoteId: string) {
    const { error } = await supabase()
      .from('note_links')
      .insert({ source_note_id: sourceNoteId, target_note_id: targetNoteId })
    if (error && !error.message.includes('unique')) throw error
  },

  async linkToTask(noteId: string, taskId: string) {
    const { error } = await supabase()
      .from('note_links')
      .insert({ source_note_id: noteId, target_task_id: taskId })
    if (error && !error.message.includes('unique')) throw error
  },

  async search(workspaceId: string, query: string) {
    const { data, error } = await supabase()
      .from('notes')
      .select('id, title, icon')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .ilike('title', `%${query}%`)
      .order('updated_at', { ascending: false })
      .limit(6)
    if (error) throw error
    return data ?? []
  },

  async convertToTask(noteId: string, workspaceId: string, userId: string, title: string) {
    const { data: task, error } = await supabase()
      .from('tasks')
      .insert({
        workspace_id: workspaceId,
        title,
        created_by: userId,
        status: 'todo',
        priority: 'medium',
      })
      .select()
      .single()
    if (error) throw error

    await supabase()
      .from('note_links')
      .insert({ source_note_id: noteId, target_task_id: task.id })

    return task
  },
}
