create table if not exists public.tier_recompute_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sync_run_id uuid references public.tier_sync_runs (id) on delete set null,
  status text not null check (status in ('baseline', 'changed', 'no_changes', 'failed')),
  mode text not null check (mode in ('incremental', 'force')),
  total_count integer not null default 0,
  tier_count integer not null default 0,
  api_count integer not null default 0,
  tier_summary jsonb not null default '{}'::jsonb,
  sample_digimon jsonb not null default '[]'::jsonb,
  api_diffs jsonb not null default '[]'::jsonb,
  api_diff_by_id jsonb not null default '{}'::jsonb,
  error_text text
);

create index if not exists tier_recompute_runs_created_at_idx
  on public.tier_recompute_runs (created_at desc);

create index if not exists tier_recompute_runs_sync_run_id_idx
  on public.tier_recompute_runs (sync_run_id);

alter table public.tier_recompute_runs enable row level security;

drop policy if exists "tier recompute runs read" on public.tier_recompute_runs;
create policy "tier recompute runs read"
  on public.tier_recompute_runs
  for select
  using (true);

drop policy if exists "tier recompute runs write authenticated" on public.tier_recompute_runs;
create policy "tier recompute runs write authenticated"
  on public.tier_recompute_runs
  for insert
  with check (auth.role() = 'authenticated');
