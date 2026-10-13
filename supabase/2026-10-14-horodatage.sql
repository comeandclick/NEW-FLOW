-- 14/10/2026 : heures des tâches (créée / en cours / terminée), remplies par la base quel que soit le chemin (app, API, agents).
-- Idempotent. À exécuter dans le SQL Editor de Supabase.
alter table public.tasks add column if not exists started_at timestamptz;

create or replace function public.tasks_horodatage() returns trigger language plpgsql as $$
begin
  -- passage « en cours » : on note l'heure la première fois
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from 'in_progress') and new.started_at is null then
    new.started_at := now();
  end if;
  -- terminée : heure de fin si l'app ne l'a pas donnée ; plus terminée : on l'efface
  if new.status = 'done' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'done' and tg_op = 'UPDATE' and old.status = 'done' then new.completed_at := null; end if;
  return new;
end $$;

drop trigger if exists tasks_horodatage on public.tasks;
create trigger tasks_horodatage before insert or update of status on public.tasks for each row execute function public.tasks_horodatage();

-- tâches déjà « en cours » : heure de passage inconnue, on prend la dernière modification
update public.tasks set started_at = updated_at where status = 'in_progress' and started_at is null;
