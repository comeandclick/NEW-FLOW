-- Atelier → Flow : fiche résumée de chaque site web (page « Site » de Flow, pensée pour l'iPhone). 14/10/2026.
-- Écrite par l'Atelier (logiciel Mac et commande `atelier site`, clé serveur) ; lue par les membres de l'espace.
-- Aucun identifiant ni mot de passe ici : ils restent sur le Mac (colonne « identifiants » = leur nombre seulement).
create table if not exists public.site_projets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  site text not null,                        -- identifiant Atelier (~/Developer/sites/_fiches/<site>.json)
  titre text not null,
  client text,
  type text not null default 'vitrine',      -- vitrine, boutique, admin, landing, location, application, autre
  statut text not null default 'en_cours' check (statut in ('en_cours','a_valider','a_corriger','en_ligne','en_pause')),
  avancement int not null default 0 check (avancement between 0 and 100),
  etape text,
  url text,                                  -- site en ligne
  admin_url text,
  local boolean not null default false,      -- page locale (serveur de développement) déclarée sur le Mac
  agent text,
  todo jsonb not null default '[]'::jsonb,   -- [{ "texte": "…", "fait": false }]
  reste jsonb not null default '[]'::jsonb,  -- ce qu'Aymen doit faire (domaine, e-mails…)
  notes text,
  identifiants int not null default 0,
  maj timestamptz not null default now(),
  primary key (workspace_id, site)
);
create index if not exists site_projets_maj on public.site_projets (workspace_id, maj desc);

alter table public.site_projets enable row level security;
drop policy if exists site_projets_lecture on public.site_projets;
create policy site_projets_lecture on public.site_projets for select using (is_member(workspace_id));
-- pas de politique d'écriture : seule la clé serveur (Atelier) écrit

do $$
begin
  alter publication supabase_realtime add table public.site_projets;
exception when duplicate_object then null; when undefined_object then null;
end $$;
