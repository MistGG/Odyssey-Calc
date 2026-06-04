-- Replace client-side paginated scans of meter_leaderboard_entries (up to 100k rows per page view)
-- with bounded server-side RPCs that return only what the UI needs.

create index if not exists meter_leaderboard_entries_scope_created_idx
  on public.meter_leaderboard_entries (dungeon_id, difficulty_id, created_at, parse_id);

create index if not exists meter_leaderboard_entries_player_created_idx
  on public.meter_leaderboard_entries (player_key, created_at desc)
  where difficulty_id >= 2;

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
  with scoped as (
    select
      e.parse_id,
      e.created_at,
      e.role_bucket,
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
    parse_id,
    created_at,
    role_bucket,
    player_key,
    display_name,
    dps,
    digimon_id,
    digimon_name,
    icon_id,
    portrait_url
  from with_prior
  where dps > prior_max_dps
  order by created_at desc;
$$;

create or replace function public.get_meter_player_scopes(
  p_player_key text,
  p_limit int default 24
)
returns table (
  dungeon_id text,
  difficulty_id int,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.dungeon_id,
    e.difficulty_id,
    max(e.created_at) as last_at
  from public.meter_leaderboard_entries e
  where lower(trim(e.player_key)) = lower(trim(p_player_key))
    and e.difficulty_id >= 2
    and e.dungeon_id is not null
    and trim(e.dungeon_id) <> ''
  group by e.dungeon_id, e.difficulty_id
  order by last_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 50));
$$;

create or replace function public.get_meter_player_leaderboard_entries(
  p_player_key text,
  p_limit int default 500
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
    e.parse_id,
    e.created_at,
    e.role_bucket,
    lower(trim(e.player_key)) as player_key,
    e.display_name,
    e.dps,
    e.digimon_id,
    e.digimon_name,
    e.icon_id,
    e.portrait_url,
    e.dungeon_id,
    e.difficulty_id
  from public.meter_leaderboard_entries e
  where lower(trim(e.player_key)) = lower(trim(p_player_key))
    and e.difficulty_id >= 2
    and e.dps > 0
    and e.role_bucket is not null
    and e.dungeon_id is not null
    and trim(e.dungeon_id) <> ''
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

grant execute on function public.get_meter_hof_gold_breaks(text, int) to anon, authenticated;
grant execute on function public.get_meter_player_scopes(text, int) to anon, authenticated;
grant execute on function public.get_meter_player_leaderboard_entries(text, int) to anon, authenticated;
