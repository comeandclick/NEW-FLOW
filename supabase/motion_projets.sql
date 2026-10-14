-- Atelier Motion → Flow : fiche résumée de chaque production motion (onglet « Productions » de la page Motion, pensé pour l'iPhone).
-- Écrite par Atelier (logiciel Mac et commande `atelier`, clé serveur) ; lue par les membres de l'espace. Rien d'autre.
create table if not exists public.motion_projets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  projet text not null,                     -- identifiant Atelier (dossier mon-atelier/productions/<projet>)
  titre text not null,
  client text not null default 'Kalimat',
  serie text,                               -- ex. « Mini-cours Kalimat »
  numero int,                               -- numéro dans la série
  statut text not null default 'en_cours' check (statut in ('en_cours','a_valider','a_corriger','valide','publie','en_pause')),
  avancement int not null default 0 check (avancement between 0 and 100),
  etape text,                               -- étape en cours, en clair (« Voix », « Vérifications »…)
  resume text,                              -- résumé court
  todo jsonb not null default '[]'::jsonb,  -- [{ "texte": "…", "fait": false }]
  video_chemin text,                        -- chemin dans le stockage « files » (vidéo finie, déjà dans Fichiers → Motion)
  video_nom text,
  publication_prevue date,
  maj timestamptz not null default now(),
  primary key (workspace_id, projet)
);
create index if not exists motion_projets_maj on public.motion_projets (workspace_id, maj desc);

alter table public.motion_projets enable row level security;
drop policy if exists motion_projets_lecture on public.motion_projets;
create policy motion_projets_lecture on public.motion_projets for select using (is_member(workspace_id));
-- pas de politique d'écriture : seule la clé serveur (Atelier) écrit

do $$
begin
  alter publication supabase_realtime add table public.motion_projets;
exception when duplicate_object then null; when undefined_object then null;
end $$;
