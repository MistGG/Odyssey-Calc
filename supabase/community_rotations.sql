-- community_rotations table
-- Run this in the Supabase SQL editor for the Odyssey project.

create table if not exists community_rotations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  digimon_id    text        not null,              -- wiki digimon id
  user_id       uuid        not null references auth.users(id) on delete cascade,
  author_name   text        not null,              -- snapshot of profiles.display_name at submit time

  skill_ids     text[]      not null,              -- customRotation sequence
  filler_ids    text[]      not null default '{}', -- customRotationFiller
  full_cycles   int         not null default 1,    -- customRotationFullCycles

  -- DPS under comparable (no gear, neutral, 180s, 1 target, melee hybrid)
  comparable_dps  double precision not null,
  sim_revision    int          not null,           -- TIER_DPS_SIM_REVISION at submit time

  -- Moderation: only 'approved' rows are used by the tier list
  status        text         not null default 'pending'
                             check (status in ('pending', 'approved', 'rejected'))
);

-- Index for tier list refresh query: approved rows per digimon
create index if not exists community_rotations_approved_idx
  on community_rotations (digimon_id, status, comparable_dps desc);

-- Each user can only have one active submission per digimon
-- (upsert logic in the client handles replacing lower-DPS submission)
create unique index if not exists community_rotations_user_digimon_idx
  on community_rotations (user_id, digimon_id);

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger community_rotations_updated_at
  before update on community_rotations
  for each row execute function update_updated_at_column();

-- RLS
alter table community_rotations enable row level security;

-- Anyone (including anon) can read approved rotations — needed for tier list refresh
create policy "read approved rotations"
  on community_rotations for select
  using (status = 'approved');

-- Authenticated users can see their own rows (any status)
create policy "users read own rotations"
  on community_rotations for select
  to authenticated
  using (user_id = auth.uid());

-- Authenticated users can insert their own rows
create policy "users insert own rotations"
  on community_rotations for insert
  to authenticated
  with check (user_id = auth.uid());

-- Authenticated users can update their own rows
create policy "users update own rotations"
  on community_rotations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'pending');

-- profiles table (if not already created by companion app)
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default ''
);
alter table profiles enable row level security;
create policy "users read own profile"   on profiles for select  to authenticated using (id = auth.uid());
create policy "users upsert own profile" on profiles for insert  to authenticated with check (id = auth.uid());
create policy "users update own profile" on profiles for update  to authenticated using (id = auth.uid());
-- Allow anon/service to read display names (for tier attribution display)
create policy "anyone reads profiles"    on profiles for select  using (true);
