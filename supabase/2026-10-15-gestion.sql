-- 15/10/2026 : module Gestion (façon Sphinx Manager) : devis, factures, interventions et ordres de mission,
-- factures reçues analysées par l'IA, catalogue d'articles, fiches clients complètes, signature du client en ligne.
-- Idempotent. À exécuter en entier dans le SQL Editor de Supabase (projet Flow).
-- Les fonctionnalités choisies à l'inscription et les infos de l'entreprise sont dans workspaces.settings : rien à créer pour elles.

-- ───────────── Fiches clients : on complète les contacts du CRM ─────────────
alter table public.crm_contacts add column if not exists kind text not null default 'particulier';
alter table public.crm_contacts add column if not exists address text;
alter table public.crm_contacts add column if not exists zip text;
alter table public.crm_contacts add column if not exists city text;
alter table public.crm_contacts add column if not exists siret text;
alter table public.crm_contacts add column if not exists ref_externe text;   -- code client Sphinx (import)

-- ───────────── Catalogue d'articles ─────────────
create table if not exists public.gestion_articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ref text,
  label text not null,
  description text,
  category text,
  unit text not null default 'u',
  price_ht numeric not null default 0,
  tva numeric not null default 20,
  ref_externe text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists gestion_articles_ws on public.gestion_articles (workspace_id, label);

-- ───────────── Documents : devis, factures, interventions (= ordres de mission), factures reçues ─────────────
create table if not exists public.gestion_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('devis', 'facture', 'intervention', 'achat')),
  number text not null,                     -- DE-2026-0001, FA-…, IN-…, AC-…
  ref_externe text,                         -- numéro d'origine (Sphinx, fournisseur…)
  contact_id uuid references public.crm_contacts(id) on delete set null,
  parent_id uuid references public.gestion_documents(id) on delete set null,   -- devis d'origine d'une facture ou d'une intervention
  title text,
  status text not null default 'brouillon',
  intervention_type text,                   -- dépannage, installation, désinstallation… (liste modifiable)
  priority text not null default 'normale',
  issued_at date not null default current_date,
  due_at date,                              -- échéance / validité
  start_at timestamptz,                     -- intervention : début prévu
  end_at timestamptz,
  address text,                             -- lieu d'intervention
  lines jsonb not null default '[]'::jsonb, -- [{ article_id, ref, label, qty, unit, price_ht, tva }]
  discount numeric not null default 0,      -- remise en %
  total_ht numeric not null default 0,
  total_tva numeric not null default 0,
  total_ttc numeric not null default 0,
  travaux text,                             -- description des travaux / compte rendu
  notes text,                               -- notes internes (jamais sur le PDF)
  assigned_to uuid[] not null default '{}', -- membres de l'équipe chargés de l'intervention
  task_id uuid references public.tasks(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  -- décision et signature
  signer_name text,
  signature text,                           -- image PNG (data URL) de la signature
  signed_at timestamptz,
  signed_via text,                          -- lien (client sur son téléphone/PC), sur_place, interne
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  public_token text unique default encode(gen_random_bytes(18), 'hex'),
  sent_at timestamptz,
  sent_to text,
  paid_at date,
  -- clôture (interventions)
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  -- facture reçue : fichier et lecture de l'IA
  file_path text,
  ai_data jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, kind, number)
);
create index if not exists gestion_documents_ws on public.gestion_documents (workspace_id, kind, issued_at desc);
create index if not exists gestion_documents_contact on public.gestion_documents (contact_id);

-- qui a modifié en dernier + heure, quel que soit le chemin (app, API, import)
create or replace function public.gestion_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists gestion_documents_touch on public.gestion_documents;
create trigger gestion_documents_touch before insert or update on public.gestion_documents for each row execute function public.gestion_touch();
drop trigger if exists gestion_articles_touch on public.gestion_articles;
create trigger gestion_articles_touch before insert or update on public.gestion_articles for each row execute function public.gestion_touch();

-- ───────────── Droits : membres de l'espace (lecture), membres non-lecteurs (écriture) ─────────────
do $$
declare t text;
begin
  foreach t in array array['gestion_articles', 'gestion_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (is_member(workspace_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (can_write(workspace_id)) with check (can_write(workspace_id))', t || '_write', t);
  end loop;
end $$;
-- La page publique de signature (/s/<jeton>) passe par le serveur avec la clé secrète : aucune lecture anonyme ici.

-- ───────────── Temps réel ─────────────
do $$
declare t text;
begin
  foreach t in array array['gestion_articles', 'gestion_documents'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;
