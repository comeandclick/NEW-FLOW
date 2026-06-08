-- ============================================================
-- Flow V2 — Initial Schema
-- ============================================================

-- PROFILES (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  timezone text default 'UTC',
  is_admin boolean default false,
  preferences jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- WORKSPACES
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  settings jsonb default '{}',
  plan text default 'free',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- WORKSPACE_MEMBERS
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member', -- owner | admin | member | viewer
  invited_by uuid references public.profiles(id),
  joined_at timestamptz default now(),
  unique(workspace_id, user_id)
);

-- PROJECTS
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  description text,
  color text default '#6366f1',
  icon text,
  status text default 'active',
  settings jsonb default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TASKS
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  status text default 'todo', -- todo | in_progress | in_review | done | cancelled
  priority text default 'medium', -- low | medium | high | urgent
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id),
  due_date timestamptz,
  start_date timestamptz,
  completed_at timestamptz,
  position float default 0,
  tags text[] default '{}',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TASK_COMMENTS
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  parent_id uuid references public.task_comments(id) on delete cascade,
  is_edited boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- NOTES
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'Untitled',
  content jsonb default '{}',
  created_by uuid references public.profiles(id),
  icon text,
  cover_url text,
  is_pinned boolean default false,
  is_archived boolean default false,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- NOTE_LINKS (note ↔ note, note ↔ task)
create table public.note_links (
  id uuid primary key default gen_random_uuid(),
  source_note_id uuid references public.notes(id) on delete cascade not null,
  target_note_id uuid references public.notes(id) on delete cascade,
  target_task_id uuid references public.tasks(id) on delete cascade,
  created_at timestamptz default now(),
  check (
    (target_note_id is not null and target_task_id is null) or
    (target_note_id is null and target_task_id is not null)
  )
);

-- MEETINGS (declared before events for FK)
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  host_id uuid references public.profiles(id),
  status text default 'scheduled', -- scheduled | active | ended
  room_id text unique not null,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- MEETING_PARTICIPANTS
create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  joined_at timestamptz,
  left_at timestamptz,
  unique(meeting_id, user_id)
);

-- EVENTS (calendar)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean default false,
  color text,
  created_by uuid references public.profiles(id),
  task_id uuid references public.tasks(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete set null,
  note_id uuid references public.notes(id) on delete set null,
  recurrence jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- EVENT_ATTENDEES
create table public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending', -- pending | accepted | declined
  unique(event_id, user_id)
);

-- CONVERSATIONS
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade,
  type text not null, -- channel | dm | group_dm
  name text,
  description text,
  is_private boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CONVERSATION_MEMBERS
create table public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  last_read_at timestamptz,
  role text default 'member', -- owner | member
  joined_at timestamptz default now(),
  unique(conversation_id, user_id)
);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text,
  parent_id uuid references public.messages(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  note_id uuid references public.notes(id) on delete set null,
  is_edited boolean default false,
  is_deleted boolean default false,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FILES
create table public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  uploaded_by uuid references public.profiles(id),
  name text not null,
  size bigint,
  mime_type text,
  storage_path text not null,
  url text,
  created_at timestamptz default now()
);

-- FILE_LINKS (file ↔ any entity)
create table public.file_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references public.files(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz default now()
);

-- REACTIONS
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  message_id uuid references public.messages(id) on delete cascade,
  comment_id uuid references public.task_comments(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, emoji, message_id),
  unique(user_id, emoji, comment_id)
);

-- NOTIFICATIONS
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  is_read boolean default false,
  action_url text,
  metadata jsonb default '{}',
  task_id uuid references public.tasks(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  created_at timestamptz default now()
);

-- ACTIVITY_LOGS
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index on public.tasks(workspace_id);
create index on public.tasks(project_id);
create index on public.tasks(assignee_id);
create index on public.tasks(status);
create index on public.tasks(due_date);
create index on public.tasks(parent_task_id);
create index on public.messages(conversation_id);
create index on public.messages(created_at desc);
create index on public.messages(parent_id);
create index on public.notifications(user_id, is_read);
create index on public.notes(workspace_id);
create index on public.notes(project_id);
create index on public.events(workspace_id, start_at, end_at);
create index on public.activity_logs(workspace_id, created_at desc);
create index on public.workspace_members(user_id);
create index on public.workspace_members(workspace_id);
create index on public.conversation_members(user_id);
create index on public.conversation_members(conversation_id);
create index on public.file_links(file_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at auto-update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.messages
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- Max 5 workspaces per user
create or replace function public.check_workspace_limit()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.workspace_members
    where user_id = new.user_id
  ) >= 5 then
    raise exception 'max_workspaces_reached';
  end if;
  return new;
end;
$$;

create trigger enforce_workspace_limit
  before insert on public.workspace_members
  for each row execute function public.check_workspace_limit();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.notes enable row level security;
alter table public.note_links enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.files enable row level security;
alter table public.file_links enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

-- Helper: check workspace membership
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

-- Helper: get user role in workspace
create or replace function public.workspace_role(ws_id uuid)
returns text language sql security definer stable as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$;

-- PROFILES
create policy "users can view own profile"
  on public.profiles for select using (id = auth.uid());

create policy "users can update own profile"
  on public.profiles for update using (id = auth.uid());

create policy "workspace members can view member profiles"
  on public.profiles for select using (
    exists (
      select 1 from public.workspace_members wm1
      join public.workspace_members wm2 on wm1.workspace_id = wm2.workspace_id
      where wm1.user_id = auth.uid() and wm2.user_id = profiles.id
    )
  );

-- WORKSPACES
create policy "members can view workspace"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "owners can update workspace"
  on public.workspaces for update
  using (owner_id = auth.uid());

create policy "authenticated users can create workspaces"
  on public.workspaces for insert
  with check (auth.uid() = owner_id);

-- WORKSPACE_MEMBERS
create policy "members can view workspace members"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "admins can manage members"
  on public.workspace_members for all
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

create policy "users can join workspace"
  on public.workspace_members for insert
  with check (auth.uid() = user_id);

-- PROJECTS
create policy "workspace members can view projects"
  on public.projects for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create projects"
  on public.projects for insert
  with check (public.is_workspace_member(workspace_id));

create policy "admins can update projects"
  on public.projects for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin', 'member'));

-- TASKS
create policy "workspace members can view tasks"
  on public.tasks for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create tasks"
  on public.tasks for insert
  with check (public.is_workspace_member(workspace_id));

create policy "workspace members can update tasks"
  on public.tasks for update
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can delete tasks"
  on public.tasks for delete
  using (
    public.workspace_role(workspace_id) in ('owner', 'admin') or
    created_by = auth.uid()
  );

-- TASK_COMMENTS
create policy "workspace members can view comments"
  on public.task_comments for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.is_workspace_member(t.workspace_id)
    )
  );

create policy "workspace members can create comments"
  on public.task_comments for insert
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.is_workspace_member(t.workspace_id)
    )
  );

create policy "users can update own comments"
  on public.task_comments for update
  using (user_id = auth.uid());

-- NOTES
create policy "workspace members can view notes"
  on public.notes for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create notes"
  on public.notes for insert
  with check (public.is_workspace_member(workspace_id));

create policy "workspace members can update notes"
  on public.notes for update
  using (public.is_workspace_member(workspace_id));

create policy "owners can delete notes"
  on public.notes for delete
  using (created_by = auth.uid() or public.workspace_role(workspace_id) in ('owner', 'admin'));

-- NOTE_LINKS
create policy "workspace members can view note links"
  on public.note_links for select
  using (
    exists (
      select 1 from public.notes n
      where n.id = source_note_id and public.is_workspace_member(n.workspace_id)
    )
  );

create policy "workspace members can create note links"
  on public.note_links for insert
  with check (
    exists (
      select 1 from public.notes n
      where n.id = source_note_id and public.is_workspace_member(n.workspace_id)
    )
  );

-- EVENTS
create policy "workspace members can view events"
  on public.events for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create events"
  on public.events for insert
  with check (public.is_workspace_member(workspace_id));

create policy "workspace members can update events"
  on public.events for update
  using (public.is_workspace_member(workspace_id));

-- CONVERSATIONS
create policy "conversation members can view conversations"
  on public.conversations for select
  using (
    public.is_workspace_member(workspace_id) and (
      not is_private or
      exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = id and cm.user_id = auth.uid()
      )
    )
  );

create policy "workspace members can create conversations"
  on public.conversations for insert
  with check (public.is_workspace_member(workspace_id));

-- CONVERSATION_MEMBERS
create policy "conversation members can view members"
  on public.conversation_members for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
  );

create policy "users can join conversations"
  on public.conversation_members for insert
  with check (user_id = auth.uid());

-- MESSAGES
create policy "conversation members can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
  );

create policy "conversation members can send messages"
  on public.messages for insert
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
  );

create policy "users can edit own messages"
  on public.messages for update
  using (user_id = auth.uid());

-- MEETINGS
create policy "workspace members can view meetings"
  on public.meetings for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create meetings"
  on public.meetings for insert
  with check (public.is_workspace_member(workspace_id));

create policy "hosts can update meetings"
  on public.meetings for update
  using (host_id = auth.uid() or public.workspace_role(workspace_id) in ('owner', 'admin'));

-- MEETING_PARTICIPANTS
create policy "workspace members can view participants"
  on public.meeting_participants for select
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id and public.is_workspace_member(m.workspace_id)
    )
  );

create policy "users can join meetings"
  on public.meeting_participants for insert
  with check (user_id = auth.uid());

create policy "users can update own participation"
  on public.meeting_participants for update
  using (user_id = auth.uid());

-- FILES
create policy "workspace members can view files"
  on public.files for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can upload files"
  on public.files for insert
  with check (public.is_workspace_member(workspace_id));

-- FILE_LINKS
create policy "workspace members can view file links"
  on public.file_links for select
  using (
    exists (
      select 1 from public.files f
      where f.id = file_id and public.is_workspace_member(f.workspace_id)
    )
  );

create policy "workspace members can create file links"
  on public.file_links for insert
  with check (
    exists (
      select 1 from public.files f
      where f.id = file_id and public.is_workspace_member(f.workspace_id)
    )
  );

-- REACTIONS
create policy "conversation members can view reactions"
  on public.reactions for select
  using (
    (message_id is not null and exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_id and cm.user_id = auth.uid()
    )) or
    (comment_id is not null and exists (
      select 1 from public.task_comments tc
      join public.tasks t on t.id = tc.task_id
      where tc.id = comment_id and public.is_workspace_member(t.workspace_id)
    ))
  );

create policy "users can add reactions"
  on public.reactions for insert
  with check (user_id = auth.uid());

create policy "users can remove own reactions"
  on public.reactions for delete
  using (user_id = auth.uid());

-- NOTIFICATIONS
create policy "users can view own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "users can update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

-- ACTIVITY_LOGS
create policy "workspace members can view activity"
  on public.activity_logs for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create activity"
  on public.activity_logs for insert
  with check (public.is_workspace_member(workspace_id));
