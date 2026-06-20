-- Cycle-window HoF reads: use materialized meter_hof_gold_entries (indexed, small egress)
-- instead of re-scanning meter_leaderboard_entries. Concluded cycles are static; live cycles
-- are kept current by ingest maintaining the materialized table.

create or replace function public.get_meter_hof_gold_breaks(
  p_dungeon_id text,
  p_difficulty_id int,
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
  portrait_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
      h.portrait_url
    from public.meter_hof_gold_entries h
    where h.dungeon_id = trim(p_dungeon_id)
      and h.difficulty_id = p_difficulty_id
    order by h.created_at desc;
    return;
  end if;

  return query
  select
    h.parse_id,
    h.created_at,
    h.role_bucket,
    h.player_key,
    coalesce(nullif(trim(h.display_name), ''), h.player_key),
    h.dps,
    coalesce(h.digimon_id, ''),
    coalesce(h.digimon_name, ''),
    h.icon_id,
    h.portrait_url
  from public.meter_hof_gold_entries h
  where h.dungeon_id = trim(p_dungeon_id)
    and h.difficulty_id = p_difficulty_id
    and h.created_at >= p_window_start
    and (p_window_end is null or h.created_at < p_window_end)
  order by h.created_at desc;
end;
$$;

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
  select
    h.parse_id,
    h.created_at,
    h.role_bucket,
    h.player_key,
    coalesce(nullif(trim(h.display_name), ''), h.player_key),
    h.dps,
    coalesce(h.digimon_id, ''),
    coalesce(h.digimon_name, ''),
    h.icon_id,
    h.portrait_url,
    h.dungeon_id,
    h.difficulty_id
  from public.meter_hof_gold_entries h
  where h.player_key = v_player_key
    and h.created_at >= p_window_start
    and (p_window_end is null or h.created_at < p_window_end)
  order by h.created_at desc;
end;
$$;

grant execute on function public.get_meter_hof_gold_breaks(text, int, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_meter_player_hof_gold_breaks(text, int, timestamptz, timestamptz) to anon, authenticated;
