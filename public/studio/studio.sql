-- Flow Studio : pont Mac <-> Flow (motion design et sites créés par Claude Code). Idempotent.
-- À exécuter UNE fois dans Supabase > SQL Editor. Aucune policy publique : seules les routes serveur (clé service) y accèdent.
create extension if not exists "pgcrypto";

create table if not exists public.studio_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  os text not null default 'macOS',
  token_hash text not null unique,
  bridge_version text,
  paired_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  busy_job uuid,
  claude_ok boolean
);
create index if not exists studio_devices_user_idx on public.studio_devices(user_id);

create table if not exists public.studio_pairings (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  poll_hash text not null unique,
  device_name text not null,
  os text not null default 'macOS',
  bridge_version text,
  status text not null default 'pending' check (status in ('pending','paired','expired','collected')),
  user_id uuid references public.profiles(id) on delete cascade,
  device_id uuid references public.studio_devices(id) on delete cascade,
  device_token_once text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.studio_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  device_id uuid references public.studio_devices(id) on delete set null,
  kind text not null check (kind in ('motion','site')),
  title text not null,
  spec jsonb not null default '{}'::jsonb,
  prompt text not null,
  status text not null default 'draft' check (status in ('draft','queued','starting','running','paused','needs_answer','done','failed','cancelled')),
  step text,
  progress int not null default 0,
  session_id text,
  error text,
  deliver jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists studio_jobs_user_idx on public.studio_jobs(user_id, created_at desc);
create index if not exists studio_jobs_status_idx on public.studio_jobs(status);

create table if not exists public.studio_events (
  id bigserial primary key,
  job_id uuid not null references public.studio_jobs(id) on delete cascade,
  at timestamptz not null default now(),
  level text not null default 'info' check (level in ('info','success','warning','error','question')),
  kind text not null default 'log',
  title text not null,
  body text,
  data jsonb
);
create index if not exists studio_events_job_idx on public.studio_events(job_id, id);

create table if not exists public.studio_commands (
  id bigserial primary key,
  job_id uuid not null references public.studio_jobs(id) on delete cascade,
  device_id uuid not null references public.studio_devices(id) on delete cascade,
  type text not null check (type in ('start','pause','resume','cancel','message','answer')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists studio_commands_dev_idx on public.studio_commands(device_id, delivered_at);

create table if not exists public.studio_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.studio_jobs(id) on delete cascade,
  text text not null,
  choices jsonb,
  asked_at timestamptz not null default now(),
  answer text,
  answered_at timestamptz
);
create index if not exists studio_questions_job_idx on public.studio_questions(job_id);

create table if not exists public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.studio_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  kind text not null default 'file',
  name text not null,
  size bigint,
  mime text,
  storage_path text,
  link text,
  uploaded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists studio_assets_user_idx on public.studio_assets(user_id, created_at desc);
create index if not exists studio_assets_job_idx on public.studio_assets(job_id);

-- RLS activée sans policy : refus total pour la clé publique, accès uniquement par les routes serveur (clé service).
alter table public.studio_devices enable row level security;
alter table public.studio_pairings enable row level security;
alter table public.studio_jobs enable row level security;
alter table public.studio_events enable row level security;
alter table public.studio_commands enable row level security;
alter table public.studio_questions enable row level security;
alter table public.studio_assets enable row level security;

-- Stockage privé des fichiers envoyés et des rendus (liens signés). 2 Go max par fichier (plan Pro requis au-delà de 50 Mo).
insert into storage.buckets (id, name, public, file_size_limit) values ('studio', 'studio', false, 2147483648)
on conflict (id) do nothing;
