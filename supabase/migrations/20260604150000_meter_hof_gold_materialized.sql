-- Materialized Hall of Fame record-break rows (maintained on leaderboard ingest).
-- Reads become O(gold rows per scope) instead of scanning full leaderboard history.

create table if not exists public.meter_hof_gold_entries (
  id uuid primary key default gen_random_uuid(),
  dungeon_id text not null,
  difficulty_id int not null,
  role_bucket text not null,
  parse_id uuid not null,
  created_at timestamptz not null,
  player_key text not null,
  display_name text not null default '',
  dps numeric not null,
  digimon_id text not null default '',
  digimon_name text not null default '',
  icon_id text,
  portrait_url text,
  constraint meter_hof_gold_entries_role_bucket_chk
    check (role_bucket in ('melee', 'ranged', 'caster', 'hybrid', 'tank', 'healer')),
  constraint meter_hof_gold_entries_dps_chk check (dps > 0)
);

create unique index if not exists meter_hof_gold_entries_natural_key_idx
  on public.meter_hof_gold_entries (
    dungeon_id,
    difficulty_id,
    role_bucket,
    parse_id,
    player_key
  );

create index if not exists meter_hof_gold_entries_scope_created_idx
  on public.meter_hof_gold_entries (dungeon_id, difficulty_id, created_at desc);

create index if not exists meter_hof_gold_entries_player_created_idx
  on public.meter_hof_gold_entries (player_key, created_at desc);

create index if not exists meter_hof_gold_entries_parse_idx
  on public.meter_hof_gold_entries (parse_id);

alter table public.meter_hof_gold_entries enable row level security;

drop policy if exists "meter hof gold read" on public.meter_hof_gold_entries;
create policy "meter hof gold read"
  on public.meter_hof_gold_entries
  for select
  using (true);

-- Rebuild gold rows for one dungeon+difficulty from full entry history (used after deletes / backfill).
create or replace function public.rebuild_meter_hof_gold_for_scope(
  p_dungeon_id text,
  p_difficulty_id int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  delete from public.meter_hof_gold_entries
  where dungeon_id = trim(p_dungeon_id)
    and difficulty_id = p_difficulty_id;

  insert into public.meter_hof_gold_entries (
    dungeon_id,
    difficulty_id,
    role_bucket,
    parse_id,
    created_at,
    player_key,
    display_name,
    dps,
    digimon_id,
    digimon_name,
    icon_id,
    portrait_url
  )
  with scoped as (
    select
      e.dungeon_id,
      e.difficulty_id,
      e.role_bucket,
      e.parse_id,
      e.created_at,
      lower(trim(e.player_key)) as player_key,
      e.display_name,
      e.dps,
      e.digimon_id,
      e.digimon_name,
      e.icon_id,
      e.portrait_url
    from public.meter_leaderboard_entries e
    where e.dungeon_id = trim(p_dungeon_id)
      and e.difficulty_id = p_difficulty_id
      and e.dps > 0
      and e.role_bucket is not null
      and e.player_key is not null
      and trim(e.player_key) <> ''
  ),
  with_prior as (
    select
      s.*,
      coalesce(
        max(s.dps) over (
          partition by s.role_bucket
          order by s.created_at, s.parse_id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as prior_max_dps
    from scoped s
  )
  select
    dungeon_id,
    difficulty_id,
    role_bucket,
    parse_id,
    created_at,
    player_key,
    coalesce(nullif(trim(display_name), ''), player_key),
    dps,
    coalesce(digimon_id, ''),
    coalesce(digimon_name, ''),
    icon_id,
    portrait_url
  from with_prior
  where dps > prior_max_dps;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Incremental insert for one new leaderboard row (fast path on ingest).
create or replace function public.try_insert_meter_hof_gold_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prior_max numeric;
  v_player_key text;
begin
  if new.dps is null or new.dps <= 0
    or new.role_bucket is null
    or new.dungeon_id is null
    or trim(new.dungeon_id) = ''
    or new.difficulty_id is null
    or new.difficulty_id < 2
    or new.player_key is null
    or trim(new.player_key) = ''
  then
    return new;
  end if;

  v_player_key := lower(trim(new.player_key));

  select coalesce(max(e.dps), 0)
  into v_prior_max
  from public.meter_leaderboard_entries e
  where e.dungeon_id = new.dungeon_id
    and e.difficulty_id = new.difficulty_id
    and e.role_bucket = new.role_bucket
    and e.dps > 0
    and (
      e.created_at < new.created_at
      or (e.created_at = new.created_at and e.parse_id < new.parse_id)
      or (e.created_at = new.created_at and e.parse_id = new.parse_id and e.player_key < v_player_key)
    );

  if new.dps <= v_prior_max then
    return new;
  end if;

  insert into public.meter_hof_gold_entries (
    dungeon_id,
    difficulty_id,
    role_bucket,
    parse_id,
    created_at,
    player_key,
    display_name,
    dps,
    digimon_id,
    digimon_name,
    icon_id,
    portrait_url
  )
  values (
    new.dungeon_id,
    new.difficulty_id,
    new.role_bucket,
    new.parse_id,
    new.created_at,
    v_player_key,
    coalesce(nullif(trim(new.display_name), ''), v_player_key),
    new.dps,
    coalesce(new.digimon_id, ''),
    coalesce(new.digimon_name, ''),
    new.icon_id,
    new.portrait_url
  )
  on conflict (dungeon_id, difficulty_id, role_bucket, parse_id, player_key) do update
  set
    created_at = excluded.created_at,
    display_name = excluded.display_name,
    dps = excluded.dps,
    digimon_id = excluded.digimon_id,
    digimon_name = excluded.digimon_name,
    icon_id = excluded.icon_id,
    portrait_url = excluded.portrait_url;

  return new;
end;
$$;

create or replace function public.meter_hof_gold_after_leaderboard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.meter_hof_gold_entries
  where parse_id = old.parse_id;
  return old;
end;
$$;

drop trigger if exists meter_leaderboard_entries_hof_gold_insert on public.meter_leaderboard_entries;
create trigger meter_leaderboard_entries_hof_gold_insert
  after insert on public.meter_leaderboard_entries
  for each row
  execute function public.try_insert_meter_hof_gold_entry();

drop trigger if exists meter_leaderboard_entries_hof_gold_delete on public.meter_leaderboard_entries;
create trigger meter_leaderboard_entries_hof_gold_delete
  after delete on public.meter_leaderboard_entries
  for each row
  execute function public.meter_hof_gold_after_leaderboard_delete();

-- One-time backfill for all scopes that have leaderboard data.
do $$
declare
  r record;
  n int;
  total int := 0;
begin
  for r in
    select distinct e.dungeon_id, e.difficulty_id
    from public.meter_leaderboard_entries e
    where e.dungeon_id is not null
      and trim(e.dungeon_id) <> ''
      and e.difficulty_id >= 2
  loop
    n := public.rebuild_meter_hof_gold_for_scope(r.dungeon_id, r.difficulty_id);
    total := total + n;
  end loop;
  raise notice 'meter_hof_gold_entries backfill inserted % rows', total;
end;
$$;

-- RPCs read the materialized table (no window scan at request time).
create or replace function public.get_meter_hof_gold_breaks(
  p_dungeon_id text,
  p_difficulty_id int
)
returns table (
  parse_id uuid,
  created_at timestamptz,
  role_bucket text,
  player_key text,
  display_name text,
  dps numeric,
  digimon_id text,
  digimon_name text,
  icon_id text,
  portrait_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.parse_id,
    h.created_at,
    h.role_bucket,
    h.player_key,
    h.display_name,
    h.dps,
    h.digimon_id,
    h.digimon_name,
    h.icon_id,
    h.portrait_url
  from public.meter_hof_gold_entries h
  where h.dungeon_id = trim(p_dungeon_id)
    and h.difficulty_id = p_difficulty_id
  order by h.created_at desc;
$$;

create or replace function public.get_meter_player_hof_gold_breaks(
  p_player_key text,
  p_scope_limit int default 24
)
returns table (
  parse_id uuid,
  created_at timestamptz,
  role_bucket text,
  player_key text,
  display_name text,
  dps numeric,
  digimon_id text,
  digimon_name text,
  icon_id text,
  portrait_url text,
  dungeon_id text,
  difficulty_id int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.parse_id,
    h.created_at,
    h.role_bucket,
    h.player_key,
    h.display_name,
    h.dps,
    h.digimon_id,
    h.digimon_name,
    h.icon_id,
    h.portrait_url,
    h.dungeon_id,
    h.difficulty_id
  from public.meter_hof_gold_entries h
  where h.player_key = lower(trim(p_player_key))
    and (h.dungeon_id, h.difficulty_id) in (
      select s.dungeon_id, s.difficulty_id
      from public.get_meter_player_scopes(p_player_key, p_scope_limit) s
    )
  order by h.created_at desc;
$$;

grant execute on function public.rebuild_meter_hof_gold_for_scope(text, int) to service_role;
grant execute on function public.get_meter_hof_gold_breaks(text, int) to anon, authenticated;
grant execute on function public.get_meter_player_hof_gold_breaks(text, int) to anon, authenticated;
