-- Admin de Flow (14/10/2026) : statistiques de visite anonymes + demandes d'aide et de support.
-- Visites : AUCUNE donnée personnelle (pas d'adresse IP, pas de cookie, pas d'identifiant) : page, provenance (domaine), type d'appareil,
-- pays (déduit par l'hébergeur), et un identifiant de visite qui change chaque jour (empreinte non réversible) → conforme RGPD sans bandeau.
create table if not exists public.site_visites (
  id bigint generated always as identity primary key,
  jour date not null default current_date,
  chemin text not null,
  espace text not null default 'site' check (espace in ('site', 'app')),
  provenance text,
  appareil text check (appareil in ('mobile', 'tablette', 'ordinateur')),
  pays text,
  visite text,
  cree_le timestamptz not null default now()
);
create index if not exists site_visites_jour on public.site_visites (jour);
alter table public.site_visites enable row level security; -- aucune politique : seul le serveur (clé secrète) lit et écrit

create table if not exists public.support_demandes (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'aide' check (type in ('aide', 'bug', 'idee', 'abonnement', 'autre')),
  sujet text not null,
  message text not null,
  email text,
  user_id uuid references auth.users(id) on delete set null,
  page text,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'en_cours', 'resolue')),
  note_admin text,
  cree_le timestamptz not null default now(),
  maj timestamptz not null default now()
);
create index if not exists support_demandes_statut on public.support_demandes (statut, cree_le desc);
alter table public.support_demandes enable row level security; -- écrites et lues par le serveur seulement
