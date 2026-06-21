-- Windowed player HoF reads difficulty_id from meter_leaderboard_entries (smallint);
-- RETURNS TABLE expects integer — cast to match.

create or replace function public.get_meter_player_hof_gold_breaks(
  p_player_key text,
  p_scope_limit int default 24,
  p_window_start timestamptz default null,
  p_window_end timestamptz default null
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
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player_key text := lower(trim(p_player_key));
begin
  if p_window_start is null then
    return query
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
    where h.player_key = v_player_key
      and (h.dungeon_id, h.difficulty_id) in (
        select s.dungeon_id, s.difficulty_id
        from public.get_meter_player_scopes(p_player_key, p_scope_limit) s
      )
    order by h.created_at desc;
    return;
  end if;

  return query
  with player_scopes as (
    select s.dungeon_id, s.difficulty_id
    from public.get_meter_player_scopes(p_player_key, p_scope_limit) s
  ),
  scoped as (
    select
      e.dungeon_id,
      e.difficulty_id,
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
    inner join player_scopes ps
      on ps.dungeon_id = e.dungeon_id
      and ps.difficulty_id = e.difficulty_id
    where e.dps > 0
      and e.role_bucket is not null
      and e.player_key is not null
      and trim(e.player_key) <> ''
      and e.created_at >= p_window_start
      and (p_window_end is null or e.created_at < p_window_end)
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
  ),
  gold as (
    select w.*
    from with_prior w
    where w.dps > w.prior_max_dps
  )
  select
    g.parse_id,
    g.created_at,
    g.role_bucket,
    g.player_key,
    coalesce(nullif(trim(g.display_name), ''), g.player_key),
    g.dps,
    coalesce(g.digimon_id, ''),
    coalesce(g.digimon_name, ''),
    g.icon_id,
    g.portrait_url,
    g.dungeon_id,
    g.difficulty_id::int
  from gold g
  where g.player_key = v_player_key
  order by g.created_at desc;
end;
$$;

grant execute on function public.get_meter_player_hof_gold_breaks(text, int, timestamptz, timestamptz) to anon, authenticated;
