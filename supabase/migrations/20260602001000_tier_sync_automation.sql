create extension if not exists pgcrypto;

create table if not exists public.tier_sync_state (
  singleton boolean primary key default true check (singleton),
  signatures jsonb not null default '{}'::jsonb,
  signatures_hash text not null default '',
  total_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.tier_sync_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null check (status in ('changed', 'no_changes', 'failed')),
  total_count integer not null default 0,
  added_count integer not null default 0,
  removed_count integer not null default 0,
  changed_count integer not null default 0,
  signatures_hash text not null default '',
  sample_digimon jsonb not null default '[]'::jsonb,
  api_diffs jsonb not null default '[]'::jsonb,
  error_text text
);

create index if not exists tier_sync_runs_created_at_idx
  on public.tier_sync_runs (created_at desc);

alter table public.tier_sync_state enable row level security;
alter table public.tier_sync_runs enable row level security;

drop policy if exists "tier sync state read" on public.tier_sync_state;
create policy "tier sync state read"
  on public.tier_sync_state
  for select
  using (true);

drop policy if exists "tier sync runs read" on public.tier_sync_runs;
create policy "tier sync runs read"
  on public.tier_sync_runs
  for select
  using (true);

