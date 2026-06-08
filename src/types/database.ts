export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// Row types (as type aliases, not interfaces — required for Supabase generic compatibility)
export type ProfileRow = {
  id: string; email: string; full_name: string | null; avatar_url: string | null
  timezone: string; is_admin: boolean; preferences: Json; created_at: string; updated_at: string
}
export type WorkspaceRow = {
  id: string; name: string; slug: string; logo_url: string | null; owner_id: string
  settings: Json; plan: string; created_at: string; updated_at: string
}
export type WorkspaceMemberRow = {
  id: string; workspace_id: string; user_id: string; role: 'owner' | 'admin' | 'member' | 'viewer'
  invited_by: string | null; joined_at: string
}
export type ProjectRow = {
  id: string; workspace_id: string; name: string; description: string | null
  color: string; icon: string | null; status: string; settings: Json
  created_by: string | null; created_at: string; updated_at: string
}
export type TaskRow = {
  id: string; workspace_id: string; project_id: string | null; parent_task_id: string | null
  title: string; description: string | null; status: 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'; assignee_id: string | null; created_by: string | null
  due_date: string | null; start_date: string | null; completed_at: string | null
  position: number; tags: string[]; metadata: Json; created_at: string; updated_at: string
}
export type TaskCommentRow = {
  id: string; task_id: string; user_id: string; content: string; parent_id: string | null
  is_edited: boolean; created_at: string; updated_at: string
}
export type NoteRow = {
  id: string; workspace_id: string; project_id: string | null; title: string; content: Json
  created_by: string | null; icon: string | null; cover_url: string | null
  is_pinned: boolean; is_archived: boolean; tags: string[]; created_at: string; updated_at: string
}
export type NoteLinkRow = {
  id: string; source_note_id: string; target_note_id: string | null; target_task_id: string | null; created_at: string
}
export type EventRow = {
  id: string; workspace_id: string; project_id: string | null; title: string; description: string | null
  start_at: string; end_at: string; all_day: boolean; color: string | null; created_by: string | null
  task_id: string | null; meeting_id: string | null; note_id: string | null; recurrence: Json | null
  created_at: string; updated_at: string
}
export type ConversationRow = {
  id: string; workspace_id: string; project_id: string | null; type: 'channel' | 'dm' | 'group_dm'
  name: string | null; description: string | null; is_private: boolean; created_by: string | null
  created_at: string; updated_at: string
}
export type ConversationMemberRow = {
  id: string; conversation_id: string; user_id: string; last_read_at: string | null; role: string; joined_at: string
}
export type MessageRow = {
  id: string; conversation_id: string; user_id: string; content: string | null; parent_id: string | null
  task_id: string | null; note_id: string | null; is_edited: boolean; is_deleted: boolean
  metadata: Json; created_at: string; updated_at: string
}
export type MeetingRow = {
  id: string; workspace_id: string; project_id: string | null; title: string; description: string | null
  host_id: string | null; status: 'scheduled' | 'active' | 'ended'; room_id: string
  scheduled_at: string | null; started_at: string | null; ended_at: string | null
  recording_url: string | null; summary: string | null; created_at: string; updated_at: string
}
export type MeetingParticipantRow = {
  id: string; meeting_id: string; user_id: string; joined_at: string | null; left_at: string | null
}
export type FileRow = {
  id: string; workspace_id: string; uploaded_by: string | null; name: string; size: number | null
  mime_type: string | null; storage_path: string; url: string | null; created_at: string
}
export type FileLinkRow = {
  id: string; file_id: string; task_id: string | null; note_id: string | null; message_id: string | null
  project_id: string | null; conversation_id: string | null; created_at: string
}
export type ReactionRow = {
  id: string; user_id: string; emoji: string; message_id: string | null; comment_id: string | null; created_at: string
}
export type NotificationRow = {
  id: string; user_id: string; workspace_id: string | null; type: string; title: string; body: string | null
  is_read: boolean; action_url: string | null; metadata: Json; task_id: string | null
  message_id: string | null; meeting_id: string | null; created_at: string
}
export type ActivityLogRow = {
  id: string; workspace_id: string; user_id: string | null; action: string; entity_type: string | null
  entity_id: string | null; metadata: Json; created_at: string
}

// Convenience aliases
export type Profile = ProfileRow
export type Workspace = WorkspaceRow
export type WorkspaceMember = WorkspaceMemberRow
export type Project = ProjectRow
export type Task = TaskRow
export type TaskComment = TaskCommentRow
export type Note = NoteRow
export type NoteLink = NoteLinkRow
export type CalendarEvent = EventRow
export type Conversation = ConversationRow
export type ConversationMember = ConversationMemberRow
export type Message = MessageRow
export type Meeting = MeetingRow
export type MeetingParticipant = MeetingParticipantRow
export type FlowFile = FileRow
export type FileLink = FileLinkRow
export type Reaction = ReactionRow
export type Notification = NotificationRow
export type ActivityLog = ActivityLogRow

export type WorkspaceInvitationRow = {
  id: string; workspace_id: string; email: string; role: string; token: string
  invited_by: string | null; welcome_message: string | null
  accepted_at: string | null; expires_at: string; created_at: string
}
export type WorkspaceInvitation = WorkspaceInvitationRow

// Insert types (all fields optional except workspace_id/required keys)
export type InsertTask = Partial<TaskRow> & Pick<TaskRow, 'workspace_id' | 'title'>
export type InsertNote = Partial<NoteRow> & Pick<NoteRow, 'workspace_id'>
export type InsertEvent = Partial<EventRow> & Pick<EventRow, 'workspace_id' | 'title' | 'start_at' | 'end_at'>
export type InsertMessage = Partial<MessageRow> & Pick<MessageRow, 'conversation_id' | 'user_id'>
export type InsertMeeting = Partial<MeetingRow> & Pick<MeetingRow, 'workspace_id' | 'title' | 'room_id'>

// Database type for Supabase client
export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow>; Relationships: [] }
      workspaces: { Row: WorkspaceRow; Insert: Partial<WorkspaceRow> & Pick<WorkspaceRow, 'name' | 'slug' | 'owner_id'>; Update: Partial<WorkspaceRow>; Relationships: [] }
      workspace_members: { Row: WorkspaceMemberRow; Insert: Partial<WorkspaceMemberRow> & Pick<WorkspaceMemberRow, 'workspace_id' | 'user_id'>; Update: Partial<WorkspaceMemberRow>; Relationships: [] }
      projects: { Row: ProjectRow; Insert: Partial<ProjectRow> & Pick<ProjectRow, 'workspace_id' | 'name'>; Update: Partial<ProjectRow>; Relationships: [] }
      tasks: { Row: TaskRow; Insert: InsertTask; Update: Partial<TaskRow>; Relationships: [] }
      task_comments: { Row: TaskCommentRow; Insert: Partial<TaskCommentRow> & Pick<TaskCommentRow, 'task_id' | 'user_id' | 'content'>; Update: Partial<TaskCommentRow>; Relationships: [] }
      notes: { Row: NoteRow; Insert: InsertNote; Update: Partial<NoteRow>; Relationships: [] }
      note_links: { Row: NoteLinkRow; Insert: Partial<NoteLinkRow> & Pick<NoteLinkRow, 'source_note_id'>; Update: Partial<NoteLinkRow>; Relationships: [] }
      events: { Row: EventRow; Insert: InsertEvent; Update: Partial<EventRow>; Relationships: [] }
      event_attendees: { Row: { id: string; event_id: string; user_id: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      conversations: { Row: ConversationRow; Insert: Partial<ConversationRow> & Pick<ConversationRow, 'workspace_id' | 'type'>; Update: Partial<ConversationRow>; Relationships: [] }
      conversation_members: { Row: ConversationMemberRow; Insert: Partial<ConversationMemberRow> & Pick<ConversationMemberRow, 'conversation_id' | 'user_id'>; Update: Partial<ConversationMemberRow>; Relationships: [] }
      messages: { Row: MessageRow; Insert: InsertMessage; Update: Partial<MessageRow>; Relationships: [] }
      meetings: { Row: MeetingRow; Insert: InsertMeeting; Update: Partial<MeetingRow>; Relationships: [] }
      meeting_participants: { Row: MeetingParticipantRow; Insert: Partial<MeetingParticipantRow> & Pick<MeetingParticipantRow, 'meeting_id' | 'user_id'>; Update: Partial<MeetingParticipantRow>; Relationships: [] }
      files: { Row: FileRow; Insert: Partial<FileRow> & Pick<FileRow, 'workspace_id' | 'name' | 'storage_path'>; Update: Partial<FileRow>; Relationships: [] }
      file_links: { Row: FileLinkRow; Insert: Partial<FileLinkRow> & Pick<FileLinkRow, 'file_id'>; Update: Partial<FileLinkRow>; Relationships: [] }
      reactions: { Row: ReactionRow; Insert: Partial<ReactionRow> & Pick<ReactionRow, 'user_id' | 'emoji'>; Update: Partial<ReactionRow>; Relationships: [] }
      notifications: { Row: NotificationRow; Insert: Partial<NotificationRow> & Pick<NotificationRow, 'user_id' | 'type' | 'title'>; Update: Partial<NotificationRow>; Relationships: [] }
      activity_logs: { Row: ActivityLogRow; Insert: Partial<ActivityLogRow> & Pick<ActivityLogRow, 'workspace_id' | 'action'>; Update: Partial<ActivityLogRow>; Relationships: [] }
      workspace_invitations: { Row: WorkspaceInvitationRow; Insert: Partial<WorkspaceInvitationRow> & Pick<WorkspaceInvitationRow, 'workspace_id' | 'email'>; Update: Partial<WorkspaceInvitationRow>; Relationships: [] }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      workspace_role: { Args: { ws_id: string }; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// Extended types with relations
export type TaskWithAssignee = Task & {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
  created_by_profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export type MessageWithUser = Message & {
  user: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'>
  reactions: Reaction[]
  file_links: FileLink[]
}

export type WorkspaceMemberWithProfile = WorkspaceMember & {
  profile: Profile
}

export type ConversationWithMembers = Conversation & {
  members: ConversationMember[]
  last_message?: Message
  unread_count?: number
}
