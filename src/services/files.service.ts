import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = () => getSupabaseClient()
const BUCKET = 'workspace-files'

export const filesService = {
  async upload(file: File, workspaceId: string, userId: string) {
    const ext = file.name.split('.').pop()
    const path = `${workspaceId}/${userId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase()
      .storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type })
    if (uploadError) throw uploadError

    const { data: urlData } = supabase()
      .storage
      .from(BUCKET)
      .getPublicUrl(path)

    const { data, error } = await supabase()
      .from('files')
      .insert({
        workspace_id: workspaceId,
        uploaded_by: userId,
        name: file.name,
        size: file.size,
        mime_type: file.type,
        storage_path: path,
        url: urlData.publicUrl,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getSignedUrl(storagePath: string, expiresIn = 3600) {
    const { data, error } = await supabase()
      .storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn)
    if (error) throw error
    return data.signedUrl
  },

  async getByWorkspace(workspaceId: string) {
    const { data, error } = await supabase()
      .from('files')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async linkToEntity(fileId: string, entity: {
    task_id?: string
    note_id?: string
    message_id?: string
    project_id?: string
    conversation_id?: string
  }) {
    const { error } = await supabase()
      .from('file_links')
      .insert({ file_id: fileId, ...entity })
    if (error) throw error
  },

  async delete(id: string, storagePath: string) {
    await supabase().storage.from(BUCKET).remove([storagePath])
    const { error } = await supabase().from('files').delete().eq('id', id)
    if (error) throw error
  },
}
