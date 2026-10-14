-- Historique de l'assistant IA (14/10/2026) : la conversation est gardée sur le compte, la même sur tous les appareils.
-- Seul « Nouvelle conversation » en commence une autre. Chaque personne ne voit que ses conversations.
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  titre text,
  messages jsonb not null default '[]'::jsonb,   -- [{ id, role, content, widgets? }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_recent on public.ai_conversations (user_id, workspace_id, updated_at desc);

alter table public.ai_conversations enable row level security;
drop policy if exists ai_conversations_moi on public.ai_conversations;
create policy ai_conversations_moi on public.ai_conversations for all
  using (user_id = auth.uid() and is_member(workspace_id))
  with check (user_id = auth.uid() and is_member(workspace_id));

do $$
begin
  alter publication supabase_realtime add table public.ai_conversations;
exception when duplicate_object then null; when undefined_object then null;
end $$;
