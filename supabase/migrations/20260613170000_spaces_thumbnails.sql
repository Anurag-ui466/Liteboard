-- Spaces (sidebar board groups) + board thumbnails.
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.spaces enable row level security;
-- a space belongs to one user; they fully manage it
create policy spaces_all on public.spaces for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.boards add column if not exists space_id uuid references public.spaces(id) on delete set null;
alter table public.boards add column if not exists thumbnail text;  -- small preview data-URI/URL of the board
