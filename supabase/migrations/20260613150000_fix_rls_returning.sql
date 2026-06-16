-- Fix: the owner check in SELECT/UPDATE policies must reference the row's own
-- owner_id column DIRECTLY. The previous helper re-queried public.boards, which
-- fails during INSERT ... RETURNING (the new row isn't visible to a self-query yet),
-- causing a false "new row violates row-level security policy" on insert+select.
-- Membership lookups still go through a SECURITY DEFINER helper that touches ONLY
-- board_members (never boards), so there's no RLS recursion.

create or replace function public.is_member(b uuid, need_edit boolean default false)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from board_members
                 where board_id = b and user_id = auth.uid()
                   and (not need_edit or role = 'editor'));
$$;

drop policy if exists boards_select on public.boards;
drop policy if exists boards_update on public.boards;
drop policy if exists members_select on public.board_members;

create policy boards_select on public.boards for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id, false));

create policy boards_update on public.boards for update to authenticated
  using (owner_id = auth.uid() or public.is_member(id, true));

-- a user sees membership rows where they are the member; the owner sees the full roster
create policy members_select on public.board_members for select to authenticated
  using (user_id = auth.uid() or public.is_board_owner(board_id));
