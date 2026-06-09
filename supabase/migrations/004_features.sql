-- ============================================================
-- Migration 004: Features expansion
-- Whiteboard, Task Relations, Version History, Trash, Realtime
-- ============================================================

-- Whiteboard items (sticky notes, shapes, drawings per workspace)
create table if not exists public.whiteboard_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  board_id text not null default 'main',  -- future: multiple boards per workspace
  type text not null default 'note',      -- note | shape | drawing | connector
  content text,
  x float default 0,
  y float default 0,
  width float default 200,
  height float default 120,
  color text default '#fef08a',           -- tailwind yellow-200 hex
  style jsonb default '{}',              -- stroke, fill, font size, etc.
  from_id uuid,                           -- connector: source item
  to_id uuid,                             -- connector: target item
  z_index integer default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists whiteboard_items_workspace_idx on public.whiteboard_items(workspace_id, board_id);

-- Task relations (link tasks to notes, files, messages, other tasks)
create table if not exists public.task_relations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  related_type text not null,  -- task | note | file | message
  related_id uuid not null,
  label text default 'related',  -- related | blocks | blocked_by | duplicates
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique(task_id, related_type, related_id)
);

create index if not exists task_relations_task_idx on public.task_relations(task_id);

-- Version history (content snapshots for notes and tasks)
create table if not exists public.version_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  entity_type text not null,   -- note | task
  entity_id uuid not null,
  entity_title text,
  content_snapshot jsonb,      -- full content at this version
  changed_fields jsonb,        -- diff: which fields changed
  changed_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists version_history_entity_idx on public.version_history(entity_type, entity_id);
create index if not exists version_history_workspace_idx on public.version_history(workspace_id, created_at desc);

-- Trash (soft-deleted items)
create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  entity_type text not null,   -- task | note | file | project
  entity_id uuid not null,
  entity_title text not null,
  entity_data jsonb not null,  -- snapshot of deleted data for restore
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz default now(),
  restore_url text             -- deep link to restore destination
);

create index if not exists trash_items_workspace_idx on public.trash_items(workspace_id, deleted_at desc);

-- Add soft-delete columns to tasks and notes (if not exist)
alter table public.tasks add column if not exists deleted_at timestamptz;
alter table public.notes add column if not exists deleted_at timestamptz;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.whiteboard_items enable row level security;
alter table public.task_relations enable row level security;
alter table public.version_history enable row level security;
alter table public.trash_items enable row level security;

drop policy if exists "whiteboard_items_policy" on public.whiteboard_items;
create policy "whiteboard_items_policy" on public.whiteboard_items
  for all using (public.is_workspace_member(workspace_id));

drop policy if exists "task_relations_policy" on public.task_relations;
create policy "task_relations_policy" on public.task_relations
  for all using (public.is_workspace_member(workspace_id));

drop policy if exists "version_history_policy" on public.version_history;
create policy "version_history_policy" on public.version_history
  for all using (public.is_workspace_member(workspace_id));

drop policy if exists "trash_items_policy" on public.trash_items;
create policy "trash_items_policy" on public.trash_items
  for all using (public.is_workspace_member(workspace_id));

-- ── Enable Realtime for key tables ───────────────────────────────────────────
-- Run these separately if the publication exists:
-- alter publication supabase_realtime add table public.notifications;
-- alter publication supabase_realtime add table public.messages;
-- alter publication supabase_realtime add table public.conversation_members;
-- alter publication supabase_realtime add table public.tasks;
-- alter publication supabase_realtime add table public.whiteboard_items;
