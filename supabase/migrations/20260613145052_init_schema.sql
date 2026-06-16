-- LiteBoard Cloud — foundation schema (M1)
-- profiles · boards · board_members(role) + Row-Level Security.
-- Access model: a board has ONE owner (the Art Director). Owners share a board
-- with others as 'editor' (the Art Lead / team) or 'viewer' (read-only tracking).

-- ---------- profiles (mirror of auth.users) ----------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  app_role    text not null default 'member',   -- art_director | art_lead | artist | admin | member
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ---------- boards -----------------------------------------------------------
create type public.board_role as enum ('owner','editor','viewer');

create table public.boards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Untitled board',
  kind        text not null default 'canvas',    -- canvas|moodboard|artbible|scoping|tasks|okr
  doc         jsonb not null default '{}'::jsonb, -- the LiteBoard document model
  status      text not null default 'draft',      -- draft|in_progress|in_review|done
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.boards enable row level security;
create index boards_owner_idx on public.boards(owner_id);

-- ---------- membership / access ---------------------------------------------
create table public.board_members (
  board_id  uuid not null references public.boards(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      public.board_role not null default 'viewer',
  added_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);
alter table public.board_members enable row level security;
create index board_members_user_idx on public.board_members(user_id);

-- ---------- access helpers (SECURITY DEFINER avoids RLS recursion) -----------
create or replace function public.is_board_owner(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from boards where id = b and owner_id = auth.uid());
$$;

create or replace function public.has_board_access(b uuid, need_edit boolean default false)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from boards where id = b and owner_id = auth.uid())
      or exists (select 1 from board_members
                  where board_id = b and user_id = auth.uid()
                    and (not need_edit or role = 'editor'));
$$;

-- ---------- RLS policies -----------------------------------------------------
-- profiles: everyone signed-in can look up colleagues (for sharing); edit only self.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- boards: see if owner or member; edit if owner or editor; insert own; delete if owner.
create policy boards_select on public.boards for select to authenticated using (has_board_access(id, false));
create policy boards_insert on public.boards for insert to authenticated with check (owner_id = auth.uid());
create policy boards_update on public.boards for update to authenticated using (has_board_access(id, true));
create policy boards_delete on public.boards for delete to authenticated using (owner_id = auth.uid());

-- board_members: members can see the roster; only the owner manages sharing.
create policy members_select on public.board_members for select to authenticated using (has_board_access(board_id, false));
create policy members_insert on public.board_members for insert to authenticated with check (is_board_owner(board_id));
create policy members_update on public.board_members for update to authenticated using (is_board_owner(board_id));
create policy members_delete on public.board_members for delete to authenticated using (is_board_owner(board_id));

-- ---------- triggers ---------------------------------------------------------
-- auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- keep boards.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger boards_touch_updated_at
  before update on public.boards for each row execute function public.touch_updated_at();

-- ---------- realtime ---------------------------------------------------------
-- broadcast board row changes to subscribed clients (live status/tracking)
alter publication supabase_realtime add table public.boards;
