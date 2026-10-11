-- Flow v3 — Social publishing (idempotent). Run in Supabase > SQL Editor.

-- ───────────────────────── Comptes réseaux sociaux ─────────────────────────
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','linkedin')),
  external_id text not null,
  username text not null,
  display_name text,
  avatar_url text,
  followers int not null default 0,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);
create index if not exists social_accounts_ws_idx on public.social_accounts(workspace_id);

-- ───────────────────────── Posts ─────────────────────────
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text,
  caption text,
  media_urls text[] not null default '{}',
  platforms text[] not null default '{}',
  account_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  publish_results jsonb,
  series_id uuid,
  template_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_ws_idx on public.social_posts(workspace_id);
create index if not exists social_posts_status_idx on public.social_posts(status);
create index if not exists social_posts_scheduled_idx on public.social_posts(scheduled_at) where scheduled_at is not null;

-- ───────────────────────── Templates de motion ─────────────────────────
create table if not exists public.social_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  type text not null check (type in ('cours','quiz','dialogue','expression','custom')),
  voice_options text[] not null default '{}',
  sfx boolean not null default true,
  duration_sec int,
  ratio text not null default '9:16',
  demo_video_url text,
  prompt_template jsonb,
  is_demo boolean not null default false,
  is_global boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.social_templates add column if not exists prompt_template jsonb;
create index if not exists social_templates_ws_idx on public.social_templates(workspace_id);

-- Template démo "cours comment dire..."
insert into public.social_templates (id, name, description, type, voice_options, sfx, duration_sec, ratio, demo_video_url, prompt_template, is_demo, is_global, sort_order)
values (
  '00000000-0000-0000-0000-000000000001',
  'Cours : Comment dire…',
  'Format pédagogique : mot en arabe, prononciation, exemple et traduction. Voix off arabe et/ou française.',
  'cours',
  array['ar','fr','ar+fr'],
  true,
  45,
  '9:16',
  'https://uwbihxsezlbqrgdebjbr.supabase.co/storage/v1/object/public/social/templates/cours-comment-dire.mp4',
  '{"series":"mini-cours Kalimat","format":"Comment dire ''...'' en arabe ? — mot/expression en arabe avec voyelles, prononciation, exemple en contexte, quiz 4 réponses, appel à télécharger Kalimat.","next":["Comment dire ''merci'' en arabe","Comment dire ''bonjour'' en arabe","Comment dire ''au revoir'' en arabe","Comment dire ''je m''appelle...'' en arabe","Comment dire ''comment tu t''appelles ?'' en arabe","Comment dire ''je t''aime'' en arabe","Comment dire ''félicitations'' en arabe","Comment dire ''s''il vous plaît'' en arabe","Comment dire ''bienvenue'' en arabe","Comment dire ''incroyable'' en arabe"]}',
  true,
  true,
  1
) on conflict (id) do update set
  demo_video_url = excluded.demo_video_url,
  prompt_template = excluded.prompt_template,
  description = excluded.description;

-- ───────────────────────── Séries automatisées ─────────────────────────
create table if not exists public.social_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  template_id uuid references public.social_templates(id) on delete set null,
  account_ids uuid[] not null default '{}',
  platforms text[] not null default '{}',
  recurrence text not null check (recurrence in ('daily','every2days','weekly')),
  time_of_day time not null default '09:00',
  timezone text not null default 'Europe/Paris',
  next_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_series_ws_idx on public.social_series(workspace_id);

-- ───────────────────────── RLS ─────────────────────────
alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_templates enable row level security;
alter table public.social_series enable row level security;

-- social_accounts: workspace members only
drop policy if exists "social_accounts_member" on public.social_accounts;
create policy "social_accounts_member" on public.social_accounts
  using (exists (select 1 from public.workspace_members where workspace_id = social_accounts.workspace_id and user_id = auth.uid()));
drop policy if exists "social_accounts_member_write" on public.social_accounts;
create policy "social_accounts_member_write" on public.social_accounts for insert
  with check (exists (select 1 from public.workspace_members where workspace_id = social_accounts.workspace_id and user_id = auth.uid()));

-- social_posts: workspace members only
drop policy if exists "social_posts_member" on public.social_posts;
create policy "social_posts_member" on public.social_posts
  using (deleted_at is null and exists (select 1 from public.workspace_members where workspace_id = social_posts.workspace_id and user_id = auth.uid()));
drop policy if exists "social_posts_member_write" on public.social_posts;
create policy "social_posts_member_write" on public.social_posts for insert
  with check (exists (select 1 from public.workspace_members where workspace_id = social_posts.workspace_id and user_id = auth.uid()));
drop policy if exists "social_posts_member_update" on public.social_posts;
create policy "social_posts_member_update" on public.social_posts for update
  using (exists (select 1 from public.workspace_members where workspace_id = social_posts.workspace_id and user_id = auth.uid()));

-- social_templates: global + own workspace
drop policy if exists "social_templates_read" on public.social_templates;
create policy "social_templates_read" on public.social_templates for select
  using (is_global or workspace_id is null or exists (select 1 from public.workspace_members where workspace_id = social_templates.workspace_id and user_id = auth.uid()));
drop policy if exists "social_templates_write" on public.social_templates;
create policy "social_templates_write" on public.social_templates for insert
  with check (workspace_id is not null and exists (select 1 from public.workspace_members where workspace_id = social_templates.workspace_id and user_id = auth.uid()));

-- social_series: workspace members only
drop policy if exists "social_series_member" on public.social_series;
create policy "social_series_member" on public.social_series
  using (exists (select 1 from public.workspace_members where workspace_id = social_series.workspace_id and user_id = auth.uid()));
drop policy if exists "social_series_member_write" on public.social_series;
create policy "social_series_member_write" on public.social_series for insert
  with check (exists (select 1 from public.workspace_members where workspace_id = social_series.workspace_id and user_id = auth.uid()));
drop policy if exists "social_series_member_update" on public.social_series;
create policy "social_series_member_update" on public.social_series for update
  using (exists (select 1 from public.workspace_members where workspace_id = social_series.workspace_id and user_id = auth.uid()));
