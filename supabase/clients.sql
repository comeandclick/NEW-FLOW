-- Clients : un espace partagé par client (discussion, fichiers livrés, liste à faire), ouvert au client par un lien secret.
-- Le client n'a pas de compte Flow : il ne voit que /c/<jeton>. Toutes ses lectures et écritures passent par
-- /api/portail/<jeton> (clé de service, côté serveur), jamais directement par la base.
-- Idempotent : peut être relancé sans risque. À exécuter dans le SQL Editor de Supabase, après schema.sql.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  company text,
  -- rythme convenu : chaque semaine, tous les 2 jours, chaque jour, ou à la demande
  cadence text not null default 'week' check (cadence in ('week', 'two_days', 'day', 'on_demand')),
  -- nombre de vidéos par période (ex. 3 par semaine), facultatif
  per_period int,
  notes text,
  color text,
  -- jeton du lien d'invitation : secret, changé par « Changer le lien » (l'ancien lien cesse de marcher)
  access_token text not null unique,
  token_rotated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- team : quelqu'un de l'espace ; client : la personne qui a le lien
  author_kind text not null check (author_kind in ('team', 'client')),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  body text not null,
  -- message lié à un fichier livré (« modif demandée sur la V1 »)
  file_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.client_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  name text not null,
  mime_type text,
  size bigint,
  storage_path text not null,
  -- même titre = même vidéo : V1, V2… après une demande de modification
  version int not null default 1,
  -- livree : envoyée au client ; modif : le client demande une modification ; validee : le client accepte ;
  -- recu : fichier envoyé par le client (référence, logo…)
  status text not null default 'livree' check (status in ('livree', 'modif', 'validee', 'recu')),
  uploaded_by_kind text not null default 'team' check (uploaded_by_kind in ('team', 'client')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.client_todos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists clients_ws on public.clients (workspace_id, created_at desc);
create index if not exists client_messages_client on public.client_messages (client_id, created_at);
create index if not exists client_files_client on public.client_files (client_id, created_at desc);
create index if not exists client_todos_client on public.client_todos (client_id, position);

-- Mêmes droits que les autres tables d'un espace : lecture pour les membres, écriture pour ceux qui peuvent écrire.
-- Aucune politique pour le rôle anonyme : le client passe uniquement par l'API serveur.
alter table public.clients enable row level security;
alter table public.client_messages enable row level security;
alter table public.client_files enable row level security;
alter table public.client_todos enable row level security;
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select using (is_member(workspace_id));
drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all using (can_write(workspace_id)) with check (can_write(workspace_id));
drop policy if exists client_messages_read on public.client_messages;
create policy client_messages_read on public.client_messages for select using (is_member(workspace_id));
drop policy if exists client_messages_write on public.client_messages;
create policy client_messages_write on public.client_messages for all using (can_write(workspace_id)) with check (can_write(workspace_id));
drop policy if exists client_files_read on public.client_files;
create policy client_files_read on public.client_files for select using (is_member(workspace_id));
drop policy if exists client_files_write on public.client_files;
create policy client_files_write on public.client_files for all using (can_write(workspace_id)) with check (can_write(workspace_id));
drop policy if exists client_todos_read on public.client_todos;
create policy client_todos_read on public.client_todos for select using (is_member(workspace_id));
drop policy if exists client_todos_write on public.client_todos;
create policy client_todos_write on public.client_todos for all using (can_write(workspace_id)) with check (can_write(workspace_id));

-- Mise à jour en direct côté équipe (le client, lui, relit l'API toutes les quelques secondes)
do $$
begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.client_messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.client_files;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.client_todos;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Stockage des fichiers clients : seau privé à part (vidéos plus lourdes que les fichiers de l'espace).
-- Chemin : <workspace_id>/<client_id>/<fichier>. L'équipe y accède par ses droits d'espace ;
-- le client par des liens signés que crée l'API serveur.
-- 50 Mo : plafond d'un envoi sur l'offre gratuite de Supabase (à relever dans les réglages du projet si l'offre le permet).
insert into storage.buckets (id, name, public, file_size_limit) values ('clients', 'clients', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "clients_files_read" on storage.objects;
create policy "clients_files_read" on storage.objects for select using (
  bucket_id = 'clients' and is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "clients_files_insert" on storage.objects;
create policy "clients_files_insert" on storage.objects for insert with check (
  bucket_id = 'clients' and can_write(((storage.foldername(name))[1])::uuid));
drop policy if exists "clients_files_delete" on storage.objects;
create policy "clients_files_delete" on storage.objects for delete using (
  bucket_id = 'clients' and can_write(((storage.foldername(name))[1])::uuid));
