-- Profile HoF list was over-collapsing because the client re-ran induction collapse on
-- player-only rows (missing intervening holders). Collapse holder streaks server-side
-- so the RPC returns true inductions with upgraded self-PB DPS — fewer/equal rows, no
-- extra client egress.

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
  if v_player_key = '' then
    return;
  end if;

  if p_window_start is null then
    return query
    with scoped_gold as (
      select
        h.parse_id,
        h.created_at,
        h.role_bucket,
        lower(trim(h.player_key)) as player_key,
        coalesce(nullif(trim(h.display_name), ''), lower(trim(h.player_key))) as display_name,
        h.dps,
        coalesce(h.digimon_id, '') as digimon_id,
        coalesce(h.digimon_name, '') as digimon_name,
        h.icon_id,
        h.portrait_url,
        h.dungeon_id,
        h.difficulty_id
      from public.meter_hof_gold_entries h
      where (h.dungeon_id, h.difficulty_id) in (
        select s.dungeon_id, s.difficulty_id
        from public.get_meter_player_scopes(p_player_key, p_scope_limit) s
      )
    ),
    with_prev as (
      select
        g.*,
        lag(g.player_key) over (
          partition by g.dungeon_id, g.difficulty_id, g.role_bucket
          order by g.created_at, g.parse_id, g.player_key
        ) as prev_holder
      from scoped_gold g
    ),
    streaks as (
      select
        p.*,
        sum(case when p.prev_holder is distinct from p.player_key then 1 else 0 end) over (
          partition by p.dungeon_id, p.difficulty_id, p.role_bucket
          order by p.created_at, p.parse_id, p.player_key
        ) as streak_id
      from with_prev p
    ),
    collapsed as (
      select distinct on (s.dungeon_id, s.difficulty_id, s.role_bucket, s.streak_id)
        s.parse_id,
        s.created_at,
        s.role_bucket,
        s.player_key,
        s.display_name,
        s.dps,
        s.digimon_id,
        s.digimon_name,
        s.icon_id,
        s.portrait_url,
        s.dungeon_id,
        s.difficulty_id
      from streaks s
      order by
        s.dungeon_id,
        s.difficulty_id,
        s.role_bucket,
        s.streak_id,
        s.dps desc,
        s.created_at desc,
        s.parse_id desc
    )
    select
      c.parse_id,
      c.created_at,
      c.role_bucket,
      c.player_key,
      c.display_name,
      c.dps,
      c.digimon_id,
      c.digimon_name,
      c.icon_id,
      c.portrait_url,
      c.dungeon_id,
      c.difficulty_id::int
    from collapsed c
    where c.player_key = v_player_key
    order by c.created_at desc;
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
    select
      w.dungeon_id,
      w.difficulty_id,
      w.parse_id,
      w.created_at,
      w.role_bucket,
      w.player_key,
      coalesce(nullif(trim(w.display_name), ''), w.player_key) as display_name,
      w.dps,
      coalesce(w.digimon_id, '') as digimon_id,
      coalesce(w.digimon_name, '') as digimon_name,
      w.icon_id,
      w.portrait_url
    from with_prior w
    where w.dps > w.prior_max_dps
  ),
  with_prev as (
    select
      g.*,
      lag(g.player_key) over (
        partition by g.dungeon_id, g.difficulty_id, g.role_bucket
        order by g.created_at, g.parse_id, g.player_key
      ) as prev_holder
    from gold g
  ),
  streaks as (
    select
      p.*,
      sum(case when p.prev_holder is distinct from p.player_key then 1 else 0 end) over (
        partition by p.dungeon_id, p.difficulty_id, p.role_bucket
        order by p.created_at, p.parse_id, p.player_key
      ) as streak_id
    from with_prev p
  ),
  collapsed as (
    select distinct on (s.dungeon_id, s.difficulty_id, s.role_bucket, s.streak_id)
      s.parse_id,
      s.created_at,
      s.role_bucket,
      s.player_key,
      s.display_name,
      s.dps,
      s.digimon_id,
      s.digimon_name,
      s.icon_id,
      s.portrait_url,
      s.dungeon_id,
      s.difficulty_id
    from streaks s
    order by
      s.dungeon_id,
      s.difficulty_id,
      s.role_bucket,
      s.streak_id,
      s.dps desc,
      s.created_at desc,
      s.parse_id desc
  )
  select
    c.parse_id,
    c.created_at,
    c.role_bucket,
    c.player_key,
    c.display_name,
    c.dps,
    c.digimon_id,
    c.digimon_name,
    c.icon_id,
    c.portrait_url,
    c.dungeon_id,
    c.difficulty_id::int
  from collapsed c
  where c.player_key = v_player_key
  order by c.created_at desc;
end;
$$;

grant execute on function public.get_meter_player_hof_gold_breaks(text, int, timestamptz, timestamptz) to anon, authenticated;
