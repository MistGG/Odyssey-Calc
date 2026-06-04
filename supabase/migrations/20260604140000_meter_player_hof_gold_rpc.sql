-- One round-trip for profile HoF: gold record-break rows for a player across their recent scopes.

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
  with player_scopes as (
    select s.dungeon_id, s.difficulty_id
    from public.get_meter_player_scopes(p_player_key, p_scope_limit) s
  ),
  scoped as (
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
    inner join player_scopes ps
      on ps.dungeon_id = e.dungeon_id
      and ps.difficulty_id = e.difficulty_id
    where e.dps > 0
      and e.role_bucket is not null
      and e.player_key is not null
      and trim(e.player_key) <> ''
  ),
  with_prior as (
    select
      s.*,
      coalesce(
        max(s.dps) over (
          partition by s.dungeon_id, s.difficulty_id, s.role_bucket
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
    portrait_url,
    dungeon_id,
    difficulty_id
  from with_prior
  where dps > prior_max_dps
    and player_key = lower(trim(p_player_key))
  order by created_at desc;
$$;

grant execute on function public.get_meter_player_hof_gold_breaks(text, int) to anon, authenticated;
