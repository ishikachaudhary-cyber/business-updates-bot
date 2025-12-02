-- Enable text search and trigram support
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Add generated tsvector column for text search
alter table if exists public.updates
  add column if not exists search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

-- Indexes for text search and trigram matching
create index if not exists idx_updates_search on public.updates using gin (search);
create index if not exists idx_updates_title_trgm on public.updates using gin (title gin_trgm_ops);
create index if not exists idx_updates_description_trgm on public.updates using gin (description gin_trgm_ops);
