-- ============================================================
-- Migration 003: Workspace invitations
-- ============================================================

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  email text not null,
  role text not null default 'member',
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by uuid references public.profiles(id),
  welcome_message text,
  accepted_at timestamptz,
  expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now(),
  unique(workspace_id, email)
);

create index if not exists invitations_workspace_idx on public.workspace_invitations(workspace_id);
create index if not exists invitations_token_idx on public.workspace_invitations(token);
create index if not exists invitations_email_idx on public.workspace_invitations(email);

alter table public.workspace_invitations enable row level security;

-- Anyone can read invitation by token (for accept flow — no auth required)
drop policy if exists "invitations_read" on public.workspace_invitations;
create policy "invitations_read" on public.workspace_invitations
  for select using (true);

-- Workspace admins/owners can manage invitations
drop policy if exists "invitations_manage" on public.workspace_invitations;
create policy "invitations_manage" on public.workspace_invitations
  for all using (public.is_workspace_member(workspace_id));
