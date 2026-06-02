create table if not exists public.tier_list_live (
  singleton boolean primary key default true check (singleton),
  cache jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tier_list_live enable row level security;

drop policy if exists "tier live read" on public.tier_list_live;
create policy "tier live read"
  on public.tier_list_live
  for select
  using (true);

drop policy if exists "tier live write authenticated" on public.tier_list_live;
create policy "tier live write authenticated"
  on public.tier_list_live
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

