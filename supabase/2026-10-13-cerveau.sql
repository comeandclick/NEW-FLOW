-- 13/10/2026 : espace « Cerveau » (projets dans des projets) + captures liées à plusieurs projets, avec aperçu.
-- Idempotent : peut être relancé sans risque. À exécuter dans le SQL Editor de Supabase, après schema.sql et captures.sql.

-- 1) Projets dans des projets : un projet peut avoir un projet parent (Kalimat > Kalimat 2.0, Motion design > Entraînement…)
alter table public.projects add column if not exists parent_id uuid references public.projects(id) on delete set null;
create index if not exists projects_parent on public.projects (parent_id);
-- un projet ne peut pas être son propre parent
alter table public.projects drop constraint if exists projects_parent_not_self;
alter table public.projects add constraint projects_parent_not_self check (parent_id is null or parent_id <> id);

-- 2) Captures liées à plusieurs projets : project_ids = TOUS les projets choisis (project_id garde le premier, pour la compatibilité)
alter table public.captures add column if not exists project_ids uuid[] not null default '{}';
update public.captures set project_ids = array[project_id] where project_id is not null and project_ids = '{}';
create index if not exists captures_project_ids on public.captures using gin (project_ids);

-- 3) Aperçu d'une capture (miniature, titre, auteur, lecteur intégré), rempli au premier affichage
alter table public.captures add column if not exists preview jsonb;
