-- Provenance: where a board/panel came from (which external tool/workflow created it).
-- Lets the dashboard badge boards/panels with their source tool's icon and auto-group them by workflow.

-- 1) Registry of workflow/tool sources. Workflows self-register (or are pre-seeded).
create table if not exists public.sources (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,           -- stable machine id a workflow identifies itself by (e.g. 'unreal')
  name        text not null,                  -- display name shown to users
  icon        text,                           -- emoji, URL, or small data-URI rendered as the source badge
  color       text default '#0071e3',         -- accent/chip color
  created_at  timestamptz not null default now()
);
alter table public.sources enable row level security;
-- Everyone signed in can READ source metadata (needed to render icons everywhere).
drop policy if exists sources_select on public.sources;
create policy sources_select on public.sources for select to authenticated using (true);
-- Authenticated callers can register a new source (idempotent via key); managed centrally otherwise.
drop policy if exists sources_insert on public.sources;
create policy sources_insert on public.sources for insert to authenticated with check (true);

-- 2) Provenance on boards: null = made natively in Lb; set = created by that workflow.
alter table public.boards add column if not exists source_id uuid references public.sources(id) on delete set null;
create index if not exists boards_source_idx on public.boards(source_id);

-- 3) A Space can REPRESENT a workflow (the auto-Space). Per-user spaces stay owner-scoped;
--    source_id marks a space as the user's auto-group for that workflow (carries the source's icon).
alter table public.spaces add column if not exists source_id uuid references public.sources(id) on delete set null;

-- (Per-panel provenance lives in the board doc JSON as panel.sourceId — no schema needed.)

-- 4) Seed known studio tools. icons are emoji placeholders — replace with real logo URLs/data-URIs later.
insert into public.sources (key, name, icon, color) values
  ('unreal',     'Unreal Engine',     '🎮', '#0E1128'),
  ('blender',    'Blender Assets',    '🟧', '#E87D0D'),
  ('comfyui',    'ComfyUI',           '🧩', '#1F6FEB'),
  ('photoshop',  'Photoshop',         '🅿', '#31A8FF'),
  ('3dpipeline', '3D Asset Pipeline', '🧊', '#7C3AED')
on conflict (key) do nothing;
