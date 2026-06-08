-- ============================================================
-- Migration 002: Workspace OS expansion
-- Wiki, CRM, Goals/OKR, Time Tracking, Favorites, Automations
-- ============================================================

-- Wiki pages (knowledge base, distinct from notes)
create table if not exists public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  parent_id uuid references public.wiki_pages(id) on delete cascade,
  title text not null default 'Sans titre',
  content jsonb default '{}',
  icon text,
  position float default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists wiki_pages_workspace_idx on public.wiki_pages(workspace_id);
create index if not exists wiki_pages_parent_idx on public.wiki_pages(parent_id);

-- CRM Contacts
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  email text,
  phone text,
  company text,
  position text,
  status text default 'lead',  -- lead | prospect | customer | churned
  tags text[] default '{}',
  notes text,
  avatar_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists crm_contacts_workspace_idx on public.crm_contacts(workspace_id);

-- CRM Deals / Pipeline
create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  title text not null,
  value numeric default 0,
  currency text default 'EUR',
  stage text default 'prospection',
  -- stages: prospection | qualification | proposition | négociation | gagné | perdu
  probability integer default 0,
  close_date date,
  notes text,
  position float default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists crm_deals_workspace_idx on public.crm_deals(workspace_id);
create index if not exists crm_deals_stage_idx on public.crm_deals(stage);

-- Goals / OKR
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  title text not null,
  description text,
  target_value numeric default 100,
  current_value numeric default 0,
  unit text default '%',
  status text default 'active',  -- active | completed | paused | cancelled
  due_date date,
  color text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists goals_workspace_idx on public.goals(workspace_id);

create table if not exists public.goal_key_results (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.goals(id) on delete cascade not null,
  title text not null,
  target_value numeric default 100,
  current_value numeric default 0,
  unit text default '%',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists goal_kr_goal_idx on public.goal_key_results(goal_id);

-- Time Tracking
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete set null,
  description text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz default now()
);

create index if not exists time_entries_workspace_idx on public.time_entries(workspace_id);
create index if not exists time_entries_user_idx on public.time_entries(user_id);

-- Favorites (pin any entity)
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  entity_type text not null,  -- task | note | project | file | wiki_page | meeting
  entity_id uuid not null,
  entity_title text not null,
  entity_url text not null,
  created_at timestamptz default now(),
  unique(user_id, entity_type, entity_id)
);

create index if not exists favorites_user_idx on public.favorites(user_id, workspace_id);

-- Automations
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  description text,
  trigger_type text not null,
  -- trigger_types: task_status_changed | task_created | task_due | member_joined | file_uploaded
  trigger_config jsonb default '{}',
  action_type text not null,
  -- action_types: send_notification | assign_task | set_status | send_message | create_task
  action_config jsonb default '{}',
  is_active boolean default true,
  run_count integer default 0,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists automations_workspace_idx on public.automations(workspace_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.wiki_pages enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_deals enable row level security;
alter table public.goals enable row level security;
alter table public.goal_key_results enable row level security;
alter table public.time_entries enable row level security;
alter table public.favorites enable row level security;
alter table public.automations enable row level security;

-- Wiki
drop policy if exists "wiki_pages_policy" on public.wiki_pages;
create policy "wiki_pages_policy" on public.wiki_pages
  for all using (public.is_workspace_member(workspace_id));

-- CRM contacts
drop policy if exists "crm_contacts_policy" on public.crm_contacts;
create policy "crm_contacts_policy" on public.crm_contacts
  for all using (public.is_workspace_member(workspace_id));

-- CRM deals
drop policy if exists "crm_deals_policy" on public.crm_deals;
create policy "crm_deals_policy" on public.crm_deals
  for all using (public.is_workspace_member(workspace_id));

-- Goals
drop policy if exists "goals_policy" on public.goals;
create policy "goals_policy" on public.goals
  for all using (public.is_workspace_member(workspace_id));

-- Key results
drop policy if exists "goal_key_results_policy" on public.goal_key_results;
create policy "goal_key_results_policy" on public.goal_key_results
  for all using (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.is_workspace_member(g.workspace_id)
    )
  );

-- Time entries
drop policy if exists "time_entries_policy" on public.time_entries;
create policy "time_entries_policy" on public.time_entries
  for all using (public.is_workspace_member(workspace_id));

-- Favorites (own only)
drop policy if exists "favorites_policy" on public.favorites;
create policy "favorites_policy" on public.favorites
  for all using (user_id = auth.uid());

-- Automations
drop policy if exists "automations_policy" on public.automations;
create policy "automations_policy" on public.automations
  for all using (public.is_workspace_member(workspace_id));
