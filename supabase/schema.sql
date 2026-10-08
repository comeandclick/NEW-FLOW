-- Flow v3 — schema complet (idempotent). À exécuter dans Supabase > SQL Editor.
create extension if not exists "pgcrypto";

-- ───────────────────────── Profils ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  locale text not null default 'fr',
  timezone text not null default 'Europe/Paris',
  status text not null default 'online',
  is_admin boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── Espaces ─────────────────────────
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'free',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token text not null unique default encode(gen_random_bytes(18),'hex'),
  invited_by uuid references public.profiles(id) on delete set null,
  message text,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- Helpers RLS (security definer → pas de récursion)
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid())
$$;
create or replace function public.can_write(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role <> 'viewer')
$$;
create or replace function public.is_admin_of(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin'))
$$;
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Création d'un espace en une transaction (owner + #general)
create or replace function public.create_workspace(p_name text, p_slug text) returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare ws public.workspaces; conv uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into workspaces (name, slug, owner_id) values (p_name, p_slug, auth.uid()) returning * into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws.id, auth.uid(), 'owner');
  insert into conversations (workspace_id, type, name, created_by) values (ws.id, 'channel', 'general', auth.uid()) returning id into conv;
  insert into conversation_members (conversation_id, user_id, role) values (conv, auth.uid(), 'owner');
  return ws;
end $$;

create or replace function public.accept_invitation(p_token text) returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare inv public.invitations; ws public.workspaces; me text;
begin
  select email into me from auth.users where id = auth.uid();
  select * into inv from invitations where token = p_token and accepted_at is null and expires_at > now();
  if inv.id is null then raise exception 'invitation invalide ou expirée'; end if;
  if lower(inv.email) <> lower(me) then raise exception 'invitation destinée à un autre email'; end if;
  insert into workspace_members (workspace_id, user_id, role, invited_by) values (inv.workspace_id, auth.uid(), inv.role, inv.invited_by)
    on conflict (workspace_id, user_id) do nothing;
  insert into conversation_members (conversation_id, user_id)
    select id, auth.uid() from conversations where workspace_id = inv.workspace_id and type = 'channel' and not is_private
    on conflict do nothing;
  update invitations set accepted_at = now() where id = inv.id;
  select * into ws from workspaces where id = inv.workspace_id;
  return ws;
end $$;

-- ───────────────────────── Projets & tâches ─────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#6366f1',
  icon text,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  parent_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('backlog','todo','in_progress','in_review','done','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  position double precision not null default 0,
  tags text[] not null default '{}',
  estimate_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists tasks_ws_idx on public.tasks(workspace_id, status);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Notes / Docs / Wiki ─────────────────────────
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  parent_id uuid references public.notes(id) on delete set null,
  kind text not null default 'note' check (kind in ('note','doc','wiki')),
  title text not null default '',
  icon text,
  content jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  is_pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  title text,
  content jsonb not null,
  saved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Calendrier ─────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  color text,
  location text,
  attendees uuid[] not null default '{}',
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ───────────────────────── Messagerie ─────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null check (type in ('channel','dm','group')),
  name text,
  description text,
  is_private boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  parent_id uuid references public.messages(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','voice','file','system','call')),
  attachments jsonb not null default '[]'::jsonb,
  mentions uuid[] not null default '{}',
  is_pinned boolean not null default false,
  is_edited boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create or replace function public.in_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = conv and user_id = auth.uid())
$$;
create or replace function public.conversation_workspace(conv uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from conversations where id = conv
$$;

-- Création de DM (idempotent)
create or replace function public.open_dm(p_workspace uuid, p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare conv uuid;
begin
  if not is_member(p_workspace) then raise exception 'forbidden'; end if;
  select c.id into conv from conversations c
    where c.workspace_id = p_workspace and c.type = 'dm'
      and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid())
      and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = p_other)
    limit 1;
  if conv is null then
    insert into conversations (workspace_id, type, is_private, created_by) values (p_workspace, 'dm', true, auth.uid()) returning id into conv;
    insert into conversation_members (conversation_id, user_id) values (conv, auth.uid()), (conv, p_other);
  end if;
  return conv;
end $$;

-- ───────────────────────── Fichiers ─────────────────────────
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder text not null default '/',
  name text not null,
  size bigint,
  mime_type text,
  storage_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ───────────────────────── Réunions ─────────────────────────
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  host_id uuid references public.profiles(id) on delete set null,
  room text not null unique default encode(gen_random_bytes(8),'hex'),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  summary text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz
);
alter table public.meeting_participants enable row level security;
drop policy if exists mp_read on public.meeting_participants;
create policy mp_read on public.meeting_participants for select using (
  exists (select 1 from meetings m where m.id = meeting_id and is_member(m.workspace_id)));
drop policy if exists mp_write on public.meeting_participants;
create policy mp_write on public.meeting_participants for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── OKR, CRM, automations ─────────────────────────
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  target numeric not null default 100,
  current numeric not null default 0,
  unit text not null default '%',
  status text not null default 'active',
  color text,
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.key_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null,
  target numeric not null default 100,
  current numeric not null default 0,
  unit text not null default '%',
  created_at timestamptz not null default now()
);
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text, phone text, company text, position text,
  status text not null default 'lead',
  tags text[] not null default '{}',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  title text not null,
  value numeric not null default 0,
  currency text not null default 'EUR',
  stage text not null default 'prospection',
  probability int not null default 10,
  close_date date,
  position double precision not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  run_count int not null default 0,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Whiteboard, habitudes, temps, finance, forms ─────────────────────────
create table if not exists public.whiteboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Tableau',
  items jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text default '#22c55e',
  target_per_week int not null default 7,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null,
  unique (habit_id, day)
);
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  note text,
  kind text not null default 'work' check (kind in ('work','focus','break')),
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  number text not null,
  kind text not null default 'invoice' check (kind in ('invoice','quote','expense')),
  contact_id uuid references public.crm_contacts(id) on delete set null,
  status text not null default 'draft',
  currency text not null default 'EUR',
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  issued_at date not null default current_date,
  due_at date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  slug text unique default encode(gen_random_bytes(5),'hex'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Notifications, push, activité, favoris ─────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, is_read, created_at desc);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.favorites enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (
  auth.uid() is not null and (id = auth.uid() or is_super_admin() or exists (
    select 1 from workspace_members a join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists ws_read on public.workspaces;
create policy ws_read on public.workspaces for select using (is_member(id) or owner_id = auth.uid() or is_super_admin());
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update using (is_admin_of(id));
drop policy if exists ws_delete on public.workspaces;
create policy ws_delete on public.workspaces for delete using (owner_id = auth.uid());

drop policy if exists wm_read on public.workspace_members;
create policy wm_read on public.workspace_members for select using (is_member(workspace_id) or is_super_admin());
drop policy if exists wm_admin_write on public.workspace_members;
create policy wm_admin_write on public.workspace_members for all using (is_admin_of(workspace_id) or user_id = auth.uid()) with check (is_admin_of(workspace_id));

drop policy if exists inv_admin on public.invitations;
create policy inv_admin on public.invitations for all using (is_admin_of(workspace_id)) with check (is_admin_of(workspace_id));

drop policy if exists conv_read on public.conversations;
create policy conv_read on public.conversations for select using (
  is_member(workspace_id) and (not is_private or in_conversation(id)));
drop policy if exists conv_write on public.conversations;
create policy conv_write on public.conversations for all using (can_write(workspace_id)) with check (can_write(workspace_id));

drop policy if exists cm_read on public.conversation_members;
create policy cm_read on public.conversation_members for select using (
  user_id = auth.uid() or in_conversation(conversation_id) or is_member(conversation_workspace(conversation_id)));
drop policy if exists cm_write on public.conversation_members;
create policy cm_write on public.conversation_members for all
  using (user_id = auth.uid() or can_write(conversation_workspace(conversation_id)))
  with check (user_id = auth.uid() or can_write(conversation_workspace(conversation_id)));

drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select using (
  in_conversation(conversation_id) or (is_member(conversation_workspace(conversation_id))
    and exists (select 1 from conversations c where c.id = conversation_id and not c.is_private)));
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert with check (user_id = auth.uid() and in_conversation(conversation_id));
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages for update using (user_id = auth.uid() or is_admin_of(conversation_workspace(conversation_id)));
drop policy if exists msg_delete on public.messages;
create policy msg_delete on public.messages for delete using (user_id = auth.uid() or is_admin_of(conversation_workspace(conversation_id)));

drop policy if exists react_read on public.reactions;
create policy react_read on public.reactions for select using (
  exists (select 1 from messages m where m.id = message_id and (in_conversation(m.conversation_id) or is_member(conversation_workspace(m.conversation_id)))));
drop policy if exists react_write on public.reactions;
create policy react_write on public.reactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for select using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete using (user_id = auth.uid());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (auth.uid() is not null and (workspace_id is null or is_member(workspace_id)));

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fav_own on public.favorites;
create policy fav_own on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists hl_member on public.habit_logs;
create policy hl_member on public.habit_logs for all using (is_member(workspace_id)) with check (can_write(workspace_id));

-- Tables à politique générique « membre de l'espace »
do $$
declare t text;
begin
  foreach t in array array[
    'projects','tasks','task_comments','notes','note_versions','events','files','meetings','goals','key_results',
    'crm_contacts','crm_deals','automations','whiteboards','habits','time_entries','invoices','forms','form_responses','activity_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (is_member(workspace_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (can_write(workspace_id)) with check (can_write(workspace_id))', t || '_write', t);
  end loop;
end $$;

-- Formulaires publics : lecture + soumission anonymes
drop policy if exists forms_public_read on public.forms;
create policy forms_public_read on public.forms for select using (is_public and deleted_at is null);
drop policy if exists form_responses_public_insert on public.form_responses;
create policy form_responses_public_insert on public.form_responses for insert with check (
  exists (select 1 from forms f where f.id = form_id and f.is_public and f.workspace_id = form_responses.workspace_id));

-- ───────────────────────── Realtime ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['messages','reactions','notifications','tasks','conversation_members','conversations','notes','events'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit) values
  ('avatars','avatars', true, 5242880),
  ('files','files', false, 26214400),
  ('voice','voice', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_own_write" on storage.objects;
create policy "avatars_own_write" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- fichiers et vocaux : chemin = <workspace_id>/...
drop policy if exists "ws_files_read" on storage.objects;
create policy "ws_files_read" on storage.objects for select using (
  bucket_id in ('files','voice') and is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "ws_files_insert" on storage.objects;
create policy "ws_files_insert" on storage.objects for insert with check (
  bucket_id in ('files','voice') and can_write(((storage.foldername(name))[1])::uuid));
drop policy if exists "ws_files_delete" on storage.objects;
create policy "ws_files_delete" on storage.objects for delete using (
  bucket_id in ('files','voice') and can_write(((storage.foldername(name))[1])::uuid));

-- Visio liée à un événement du calendrier
alter table public.events add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

-- Formulaire de contact du site (insertion publique, lecture réservée au service)
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, message text not null,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert with check (length(message) between 1 and 4000 and length(email) between 3 and 320 and length(name) between 1 and 200);

-- ───────────────────────── Durcissement sécurité (audit) ─────────────────────────
-- 1) Rejoindre une conversation : jamais soi-même dans une conversation privée.
create or replace function public.conv_creator(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations where id = conv and created_by = auth.uid())
$$;
drop policy if exists cm_write on public.conversation_members;
drop policy if exists cm_insert on public.conversation_members;
drop policy if exists cm_update on public.conversation_members;
drop policy if exists cm_delete on public.conversation_members;
create policy cm_insert on public.conversation_members for insert with check (
  in_conversation(conversation_id)
  or conv_creator(conversation_id)
  or (user_id = auth.uid() and is_member(conversation_workspace(conversation_id))
      and exists (select 1 from conversations c where c.id = conversation_id and not c.is_private)));
create policy cm_update on public.conversation_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cm_delete on public.conversation_members for delete using (user_id = auth.uid() or conv_creator(conversation_id) or is_admin_of(conversation_workspace(conversation_id)));

-- 2) Notifications : uniquement vers un membre du même espace.
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (
  workspace_id is not null and is_member(workspace_id)
  and exists (select 1 from workspace_members m where m.workspace_id = notifications.workspace_id and m.user_id = notifications.user_id));

-- 3) Le rôle « owner » ne peut ni être attribué ni retiré par un administrateur.
create or replace function public.guard_member_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.role = 'owner' and old.role <> 'owner' then raise exception 'cannot grant owner'; end if;
    if old.role = 'owner' and new.role <> 'owner' then raise exception 'cannot demote owner'; end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'owner' and exists (select 1 from workspaces w where w.id = old.workspace_id) then raise exception 'cannot remove owner'; end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_member_change on public.workspace_members;
create trigger guard_member_change before update or delete on public.workspace_members for each row execute function public.guard_member_change();

-- 4) owner_id d'un espace immuable.
create or replace function public.guard_workspace_owner() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then raise exception 'owner_id is immutable'; end if;
  return new;
end $$;
drop trigger if exists guard_workspace_owner on public.workspaces;
create trigger guard_workspace_owner before update on public.workspaces for each row execute function public.guard_workspace_owner();

-- 5) Un utilisateur ne peut pas écrire dans le journal sous le nom d'un autre.
drop policy if exists activity_logs_write on public.activity_logs;
create policy activity_logs_write on public.activity_logs for insert with check (can_write(workspace_id) and (user_id is null or user_id = auth.uid()));
