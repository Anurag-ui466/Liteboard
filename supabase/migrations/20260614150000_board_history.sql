-- #4 (pragmatic): board version history. Snapshots are written as the board is edited;
-- users can restore a previous version. (The full Miro op-log comes with the #3 Yjs binding.)
create table if not exists public.board_history (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards(id) on delete cascade,
  doc         jsonb not null,
  title       text,
  saved_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.board_history enable row level security;
create index if not exists board_history_board_idx on public.board_history(board_id, created_at desc);

-- members can view history; editors can add a snapshot; owner can delete
drop policy if exists bh_select on public.board_history;
drop policy if exists bh_insert on public.board_history;
drop policy if exists bh_delete on public.board_history;
create policy bh_select on public.board_history for select to authenticated using (public.has_board_access(board_id, false));
create policy bh_insert on public.board_history for insert to authenticated with check (public.has_board_access(board_id, true));
create policy bh_delete on public.board_history for delete to authenticated using (public.is_board_owner(board_id));

-- keep only the latest 30 snapshots per board
create or replace function public.prune_board_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.board_history where board_id = new.board_id and id not in (
    select id from public.board_history where board_id = new.board_id order by created_at desc limit 30
  );
  return null;
end; $$;
drop trigger if exists board_history_prune on public.board_history;
create trigger board_history_prune after insert on public.board_history for each row execute function public.prune_board_history();
