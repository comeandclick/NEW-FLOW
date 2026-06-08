import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = () => getSupabaseClient()

export const workspacesService = {
  async getForUser(userId: string) {
    const { data, error } = await supabase()
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces(*)
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
    if (error) throw error
    type MemberRow = { role: string; workspace: Record<string, unknown> | null }
    return ((data as unknown as MemberRow[]) ?? [])
      .map((m) => ({ ...m.workspace, userRole: m.role }))
      .filter((w): w is Record<string, unknown> & { userRole: string } => w != null)
  },

  async getBySlug(slug: string) {
    const { data, error } = await supabase()
      .from('workspaces')
      .select('*')
      .eq('slug', slug)
      .single()
    if (error) throw error
    return data
  },

  async create(name: string, userId: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).substring(2, 7)

    const { data: workspace, error: wsError } = await supabase()
      .from('workspaces')
      .insert({ name, slug, owner_id: userId })
      .select()
      .single()
    if (wsError) throw wsError

    const { error: memberError } = await supabase()
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: userId, role: 'owner' })
    if (memberError) throw memberError

    // Auto-create general channel
    const { data: channel } = await supabase()
      .from('conversations')
      .insert({ workspace_id: workspace.id, type: 'channel', name: 'general', created_by: userId })
      .select()
      .single()

    if (channel) {
      await supabase().from('conversation_members').insert({
        conversation_id: channel.id,
        user_id: userId,
        role: 'owner',
      })
    }

    return workspace
  },

  async getMembers(workspaceId: string) {
    const { data, error } = await supabase()
      .from('workspace_members')
      .select(`
        *,
        profile:profiles(id, full_name, avatar_url, email, timezone)
      `)
      .eq('workspace_id', workspaceId)
    if (error) throw error
    return data
  },

  async inviteMember(workspaceId: string, email: string, role: 'admin' | 'member' | 'viewer' = 'member', invitedBy: string) {
    // Find user by email
    const { data: profile, error: profileError } = await supabase()
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (profileError || !profile) throw new Error('User not found. They must sign up first.')

    const { error } = await supabase()
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: profile.id, role, invited_by: invitedBy })
    if (error) {
      if (error.message.includes('unique')) throw new Error('User is already a member')
      if (error.message.includes('max_workspaces_reached')) throw new Error('User has reached the maximum of 5 workspaces')
      throw error
    }

    return profile
  },

  async updateMemberRole(workspaceId: string, userId: string, role: 'admin' | 'member' | 'viewer') {
    const { error } = await supabase()
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async removeMember(workspaceId: string, userId: string) {
    const { error } = await supabase()
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async getProjects(workspaceId: string) {
    const { data, error } = await supabase()
      .from('projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  },

  async createProject(workspaceId: string, userId: string, name: string, description?: string, color?: string) {
    const { data, error } = await supabase()
      .from('projects')
      .insert({ workspace_id: workspaceId, name, description, color: color ?? '#6366f1', created_by: userId })
      .select()
      .single()
    if (error) throw error

    // Auto-create project channel
    const { data: channel } = await supabase()
      .from('conversations')
      .insert({ workspace_id: workspaceId, type: 'channel', name: name.toLowerCase(), project_id: data.id, created_by: userId })
      .select()
      .single()

    if (channel) {
      await supabase().from('conversation_members').insert({
        conversation_id: channel.id,
        user_id: userId,
        role: 'owner',
      })
    }

    return data
  },
}
