-- Per-project branding: an optional custom icon per board (small data-URI or URL).
-- Falls back to the default "Lb" mark when null. Title (project name) is already editable via boards.title.
alter table public.boards add column if not exists icon text;
