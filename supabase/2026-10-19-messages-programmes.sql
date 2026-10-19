-- 19/10/2026 : messages programmés (app Flow Workspace, puis le site).
-- Un message programmé attend dans scheduled_messages ; chaque minute, la base publie ceux dont l'heure est passée
-- dans messages (même auteur, même conversation), crée la notification dans l'app pour les autres membres, puis le retire.
-- Idempotent. À exécuter dans le SQL Editor de Supabase (ou `supabase db query --file … --linked`).

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  parent_id uuid references public.messages(id) on delete set null,
  mentions uuid[] not null default '{}',
  send_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_messages_due_idx on public.scheduled_messages(send_at);
create index if not exists scheduled_messages_user_idx on public.scheduled_messages(user_id, conversation_id);

alter table public.scheduled_messages enable row level security;
-- Chacun ne voit et ne gère que ses messages programmés, seulement dans une conversation dont il est membre.
drop policy if exists sched_own on public.scheduled_messages;
create policy sched_own on public.scheduled_messages for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.conversation_members cm where cm.conversation_id = scheduled_messages.conversation_id and cm.user_id = auth.uid()));

create or replace function public.flow_messages_programmes_tick() returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  ws uuid;
  slug text;
  conv record;
  auteur text;
begin
  for m in delete from scheduled_messages where send_at <= now() returning * loop
    -- l'auteur doit encore être membre de la conversation
    continue when not exists (select 1 from conversation_members where conversation_id = m.conversation_id and user_id = m.user_id);
    insert into messages (conversation_id, user_id, content, parent_id, mentions, kind)
      values (m.conversation_id, m.user_id, m.content, m.parent_id, m.mentions, 'text');
    update conversations set updated_at = now() where id = m.conversation_id returning workspace_id, type, name into conv;
    select w.id, w.slug into ws, slug from workspaces w where w.id = conv.workspace_id;
    select coalesce(full_name, '') into auteur from profiles where id = m.user_id;
    insert into notifications (user_id, workspace_id, type, title, body, url)
      select cm.user_id, ws,
        case when cm.user_id = any(m.mentions) then 'mention' else 'message' end,
        auteur || case when conv.type = 'channel' then ' · #' || conv.name else '' end,
        left(m.content, 120),
        '/app/' || slug || '/messages/' || m.conversation_id
      from conversation_members cm
      where cm.conversation_id = m.conversation_id and cm.user_id <> m.user_id and coalesce(cm.muted, false) = false;
  end loop;
end $$;
revoke all on function public.flow_messages_programmes_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'flow-messages-programmes';
select cron.schedule('flow-messages-programmes', '* * * * *', $$ select public.flow_messages_programmes_tick() $$);
