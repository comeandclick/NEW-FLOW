-- Captures : ce qu'on envoie vers Flow depuis « Partager » (TikTok, Reels, liens, captures d'écran, vidéos, texte).
-- Idempotent : peut être relancé sans risque. À exécuter dans le SQL Editor de Supabase, après schema.sql.

create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- projet de rangement ; par défaut le « projet en cours » de la personne qui envoie
  project_id uuid references public.projects(id) on delete set null,
  kind text not null default 'lien' check (kind in ('tiktok', 'instagram', 'youtube', 'lien', 'image', 'video', 'texte')),
  url text,
  file_id uuid references public.files(id) on delete set null,
  title text,
  -- note écrite ou dictée au moment de l'envoi
  note text,
  -- nouveau : pas encore regardée par l'IA ; vu : analysée
  status text not null default 'nouveau' check (status in ('nouveau', 'vu')),
  -- remplis par le tri : résumé, connaissances retenues, tâches créées, note du coffre Obsidian
  summary text,
  knowledge text,
  task_ids uuid[] not null default '{}',
  obsidian_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists captures_ws_status on public.captures (workspace_id, status, created_at desc);
create index if not exists captures_project on public.captures (project_id);

-- Mêmes droits que les autres tables d'un espace : lecture pour les membres, écriture pour ceux qui peuvent écrire.
alter table public.captures enable row level security;
drop policy if exists captures_read on public.captures;
create policy captures_read on public.captures for select using (is_member(workspace_id));
drop policy if exists captures_write on public.captures;
create policy captures_write on public.captures for all using (can_write(workspace_id)) with check (can_write(workspace_id));

-- Mise à jour en direct dans l'application
do $$
begin
  alter publication supabase_realtime add table public.captures;
exception when duplicate_object then null; when undefined_object then null;
end $$;
