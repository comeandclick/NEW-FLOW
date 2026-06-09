import { getSupabaseClient } from '@/lib/supabase/client'
import type { Task, InsertTask } from '@/types/database'

const supabase = () => getSupabaseClient()

export const tasksService = {
  async getByWorkspace(workspaceId: string, projectId?: string) {
    let query = supabase()
      .from('tasks')
      .select(`
        *,
        assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url, email),
        created_by_profile:profiles!tasks_created_by_fkey(id, full_name, avatar_url)
      `)
      .eq('workspace_id', workspaceId)
      .is('parent_task_id', null)
      .order('position', { ascending: true })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getSubtasks(parentTaskId: string) {
    const { data, error } = await supabase()
      .from('tasks')
      .select('*')
      .eq('parent_task_id', parentTaskId)
      .order('position', { ascending: true })
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabase()
      .from('tasks')
      .select(`
        *,
        assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url, email),
        created_by_profile:profiles!tasks_created_by_fkey(id, full_name, avatar_url),
        project:projects(id, name, color)
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create(task: InsertTask) {
    const { data, error } = await supabase()
      .from('tasks')
      .insert(task)
      .select()
      .single()
    if (error) throw error

    // Auto-create calendar event if due_date set
    if (task.due_date && data) {
      await supabase().from('events').insert({
        workspace_id: task.workspace_id,
        project_id: task.project_id ?? null,
        title: task.title,
        start_at: task.due_date,
        end_at: task.due_date,
        all_day: true,
        task_id: data.id,
        created_by: task.created_by ?? null,
      })
    }

    // Log activity
    await supabase().from('activity_logs').insert({
      workspace_id: task.workspace_id,
      user_id: task.created_by ?? null,
      action: 'task.created',
      entity_type: 'task',
      entity_id: data.id,
      metadata: { title: task.title },
    })

    return data
  },

  async update(id: string, updates: Partial<Task>, meta?: { userId?: string; workspaceId?: string }) {
    const { data, error } = await supabase()
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    // Mark completed_at when status → done
    if (updates.status === 'done' && !updates.completed_at) {
      await supabase()
        .from('tasks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', id)
    }

    // Auto-insert version history (fire-and-forget)
    if (meta?.workspaceId) {
      supabase().from('version_history').insert({
        workspace_id: meta.workspaceId,
        entity_type: 'task',
        entity_id: id,
        entity_title: data?.title ?? null,
        content_snapshot: null,
        changed_fields: Object.keys(updates) as unknown as import('@/types/database').Json,
        changed_by: meta.userId ?? null,
      }).then(() => {}) // silent
    }

    return data
  },

  async delete(id: string) {
    const { error } = await supabase().from('tasks').delete().eq('id', id)
    if (error) throw error
  },

  async reorder(tasks: { id: string; position: number }[]) {
    const updates = tasks.map(({ id, position }) =>
      supabase().from('tasks').update({ position }).eq('id', id)
    )
    await Promise.all(updates)
  },

  async getComments(taskId: string) {
    const { data, error } = await supabase()
      .from('task_comments')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url, email)
      `)
      .eq('task_id', taskId)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  },

  async addComment(taskId: string, userId: string, content: string, parentId?: string) {
    const { data, error } = await supabase()
      .from('task_comments')
      .insert({ task_id: taskId, user_id: userId, content, parent_id: parentId ?? null })
      .select(`*, user:profiles(id, full_name, avatar_url, email)`)
      .single()
    if (error) throw error
    return data
  },

  async deleteComment(id: string) {
    const { error } = await supabase().from('task_comments').delete().eq('id', id)
    if (error) throw error
  },

  async search(workspaceId: string, query: string) {
    const { data, error } = await supabase()
      .from('tasks')
      .select('id, title, status, priority')
      .eq('workspace_id', workspaceId)
      .ilike('title', `%${query}%`)
      .is('parent_task_id', null)
      .order('updated_at', { ascending: false })
      .limit(6)
    if (error) throw error
    return data ?? []
  },
}
