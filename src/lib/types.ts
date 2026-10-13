export type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type Profile = {
  id: string; email: string; full_name: string | null; avatar_url: string | null; locale: string; timezone: string
  status: string; is_admin: boolean; preferences: Record<string, unknown>
}
export type Workspace = { id: string; name: string; slug: string; logo_url: string | null; owner_id: string; plan: string; settings: Record<string, unknown> }
export type Member = { id: string; workspace_id: string; user_id: string; role: Role; joined_at: string }
export type Project = { id: string; workspace_id: string; name: string; description: string | null; color: string; icon: string | null; status: string; created_by: string | null; created_at: string; deleted_at: string | null; /** projet parent (projets dans des projets) */ parent_id?: string | null }
export type Task = {
  id: string; workspace_id: string; project_id: string | null; parent_id: string | null; title: string; description: string | null
  status: TaskStatus; priority: Priority; assignee_id: string | null; created_by: string | null; due_date: string | null
  completed_at: string | null; position: number; tags: string[]; estimate_minutes: number | null; created_at: string; updated_at: string; deleted_at: string | null
}
export type Note = {
  id: string; workspace_id: string; project_id: string | null; parent_id: string | null; kind: 'note' | 'doc' | 'wiki'; title: string; icon: string | null
  content: Record<string, unknown>; tags: string[]; is_pinned: boolean; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null
}
export type CalEvent = {
  id: string; workspace_id: string; title: string; description: string | null; start_at: string; end_at: string; all_day: boolean
  color: string | null; location: string | null; attendees: string[]; task_id: string | null; meeting_id: string | null; created_by: string | null; deleted_at: string | null
}
export type Conversation = { id: string; workspace_id: string; type: 'channel' | 'dm' | 'group'; name: string | null; description: string | null; is_private: boolean; created_by: string | null; created_at: string; updated_at: string }
export type ConvMember = { id: string; conversation_id: string; user_id: string; role?: string; last_read_at: string; muted: boolean }
export type Attachment = { type: 'audio' | 'file' | 'image' | 'video'; url?: string; path?: string; name?: string; size?: number; mime?: string; duration?: number; waveform?: number[] }
export type Message = {
  id: string; conversation_id: string; user_id: string; content: string | null; parent_id: string | null; kind: 'text' | 'voice' | 'file' | 'system' | 'call'
  attachments: Attachment[]; mentions: string[]; is_pinned: boolean; is_edited: boolean; deleted_at: string | null; created_at: string; updated_at: string
}
export type Reaction = { id: string; message_id: string; user_id: string; emoji: string }
/** Something sent to Flow from a share sheet (link, image, video, text), sorted later by the AI. */
export type Capture = {
  id: string; workspace_id: string; project_id: string | null; kind: 'tiktok' | 'instagram' | 'youtube' | 'lien' | 'image' | 'video' | 'texte'
  url: string | null; file_id: string | null; title: string | null; note: string | null; status: 'nouveau' | 'vu'; ai_analysis: boolean
  project_ids: string[]; preview: import('@/lib/captures').CapturePreview | null
  summary: string | null; knowledge: string | null; task_ids: string[]; obsidian_note: string | null
  created_by: string | null; created_at: string; updated_at: string; processed_at: string | null; deleted_at: string | null
}
export type FileRow = { id: string; workspace_id: string; folder: string; name: string; size: number | null; mime_type: string | null; storage_path: string; uploaded_by: string | null; created_at: string; deleted_at: string | null }
export type Meeting = { id: string; workspace_id: string; title: string; description: string | null; host_id: string | null; room: string; status: 'scheduled' | 'live' | 'ended'; scheduled_at: string | null; started_at: string | null; ended_at: string | null; summary: string | null; created_at: string; deleted_at: string | null }
export type Goal = { id: string; workspace_id: string; title: string; description: string | null; target: number; current: number; unit: string; status: string; color: string | null; due_date: string | null; deleted_at: string | null }
export type KeyResult = { id: string; goal_id: string; title: string; target: number; current: number; unit: string }
export type Contact = { id: string; workspace_id: string; name: string; email: string | null; phone: string | null; company: string | null; position: string | null; status: string; tags: string[]; notes: string | null; deleted_at: string | null }
export type Deal = { id: string; workspace_id: string; contact_id: string | null; title: string; value: number; currency: string; stage: string; probability: number; close_date: string | null; position: number; deleted_at: string | null }
export type Automation = { id: string; workspace_id: string; name: string; trigger_type: string; trigger_config: Record<string, unknown>; action_type: string; action_config: Record<string, unknown>; is_active: boolean; run_count: number; last_run_at: string | null }
export type Notification = { id: string; user_id: string; workspace_id: string | null; type: string; title: string; body: string | null; url: string | null; is_read: boolean; created_at: string }
export type Activity = { id: string; workspace_id: string; user_id: string | null; action: string; entity_type: string | null; entity_id: string | null; meta: Record<string, unknown>; created_at: string }
export type Habit = { id: string; workspace_id: string; user_id: string; name: string; color: string | null; target_per_week: number; deleted_at: string | null }
export type TimeEntry = { id: string; workspace_id: string; user_id: string; task_id: string | null; project_id: string | null; note: string | null; kind: 'work' | 'focus' | 'break'; started_at: string; ended_at: string | null }
export type Invoice = { id: string; workspace_id: string; number: string; kind: 'invoice' | 'quote' | 'expense'; contact_id: string | null; status: string; currency: string; items: { label: string; qty: number; price: number }[]; total: number; issued_at: string; due_at: string | null; deleted_at: string | null }
export type FormRow = { id: string; workspace_id: string; title: string; description: string | null; fields: FormField[]; is_public: boolean; slug: string; deleted_at: string | null }
export type FormField = { id: string; type: 'text' | 'textarea' | 'select' | 'email' | 'number'; label: string; options?: string[]; required?: boolean }
export type Favorite = { id: string; user_id: string; workspace_id: string; entity_type: string; entity_id: string; title: string; url: string }
export type WhiteboardItem = { id: string; type: 'sticky' | 'text' | 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; text: string; color: string }
export type Whiteboard = { id: string; workspace_id: string; name: string; items: WhiteboardItem[]; updated_at: string; deleted_at: string | null }
