-- Cycle-scoped HoF must replay leaderboard rows inside the cycle window (baseline resets
-- each season). Reading meter_hof_gold_entries by date only shows all-time breaks that
-- happened to occur in-window, which hides in-cycle role competition.

create or replace function public.hof_leaderboard_row_is_cycle_induction(
  p_dungeon_id text,
  p_difficulty_id int,
  p_role_bucket text,
  p_player_key text,
  p_dps numeric,
  p_created_at timestamptz,
  p_parse_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player text := lower(trim(p_player_key));
  v_running_max numeric := 0;
  v_holder text := null;
  r record;
begin
  if v_player = ''
    or p_dps is null
    or p_dps <= 0
    or p_window_start is null
  then
    return false;
  end if;

  for r in
    select
      lower(trim(e.player_key)) as player_key,
      e.dps
    from public.meter_leaderboard_entries e
    where e.dungeon_id = trim(p_dungeon_id)
      and e.difficulty_id = p_difficulty_id
      and e.role_bucket = p_role_bucket
      and e.dps > 0
      and e.player_key is not null
      and trim(e.player_key) <> ''
      and e.created_at >= p_window_start
      and (p_window_end is null or e.created_at < p_window_end)
      and (
        e.created_at < p_created_at
        or (e.created_at = p_created_at and e.parse_id < p_parse_id)
        or (
          e.created_at = p_created_at
          and e.parse_id = p_parse_id
          and lower(trim(e.player_key)) < v_player
        )
      )
    order by e.created_at, e.parse_id, lower(trim(e.player_key))
  loop
    if r.dps <= v_running_max then
      continue;
    end if;

    if v_holder is not null and v_holder = r.player_key then
      v_running_max := r.dps;
      continue;
    end if;

    v_running_max := r.dps;
    v_holder := r.player_key;
  end loop;

  if p_dps <= v_running_max then
    return false;
  end if;

  if v_holder is not null and v_holder = v_player then
    return false;
  end if;

  return true;
end;
$$;

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
      and e.created_at >= p_window_start
      and (p_window_end is null or e.created_at < p_window_end)
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
    w.parse_id,
    w.created_at,
    w.role_bucket,
    w.player_key,
    coalesce(nullif(trim(w.display_name), ''), w.player_key),
    w.dps,
    coalesce(w.digimon_id, ''),
    coalesce(w.digimon_name, ''),
    w.icon_id,
    w.portrait_url
  from with_prior w
  where w.dps > w.prior_max_dps
  order by w.created_at desc;
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
    select *
    from with_prior
    where dps > prior_max_dps
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
    g.difficulty_id
  from gold g
  where g.player_key = v_player_key
  order by g.created_at desc;
end;
$$;

create or replace function public.refresh_meter_hof_cycle_summary(p_cycle_id text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id text := trim(p_cycle_id);
  v_starts timestamptz;
  v_ends timestamptz;
  v_rows int;
begin
  select c.starts_at, c.ends_at
  into v_starts, v_ends
  from public.meter_leaderboard_cycles c
  where c.id = v_cycle_id;

  if v_starts is null then
    raise exception 'Unknown cycle: %', v_cycle_id;
  end if;

  delete from public.meter_hof_cycle_player_summary s
  where s.cycle_id = v_cycle_id;

  insert into public.meter_hof_cycle_player_summary (cycle_id, player_key, induction_count, updated_at)
  select
    v_cycle_id,
    lower(trim(e.player_key)),
    count(*)::int,
    now()
  from public.meter_leaderboard_entries e
  where e.created_at >= v_starts
    and (v_ends is null or e.created_at < v_ends)
    and e.dps > 0
    and e.role_bucket is not null
    and e.player_key is not null
    and trim(e.player_key) <> ''
    and e.difficulty_id >= 2
    and public.hof_leaderboard_row_is_cycle_induction(
      e.dungeon_id,
      e.difficulty_id,
      e.role_bucket,
      e.player_key,
      e.dps,
      e.created_at,
      e.parse_id,
      v_starts,
      v_ends
    )
  group by lower(trim(e.player_key));

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.meter_hof_cycle_summary_after_leaderboard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.dps is null
    or new.dps <= 0
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

  for r in
    select c.starts_at, c.ends_at
    from public.meter_leaderboard_cycles c
    where new.created_at >= c.starts_at
      and (c.ends_at is null or new.created_at < c.ends_at)
  loop
    if public.hof_leaderboard_row_is_cycle_induction(
      new.dungeon_id,
      new.difficulty_id,
      new.role_bucket,
      new.player_key,
      new.dps,
      new.created_at,
      new.parse_id,
      r.starts_at,
      r.ends_at
    ) then
      perform public.bump_meter_hof_cycle_summary_for_gold_row(new.player_key, new.created_at, 1);
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.meter_hof_cycle_summary_after_leaderboard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if old.dps is null
    or old.dps <= 0
    or old.role_bucket is null
    or old.dungeon_id is null
    or trim(old.dungeon_id) = ''
    or old.difficulty_id is null
    or old.difficulty_id < 2
    or old.player_key is null
    or trim(old.player_key) = ''
  then
    return old;
  end if;

  for r in
    select c.starts_at, c.ends_at
    from public.meter_leaderboard_cycles c
    where old.created_at >= c.starts_at
      and (c.ends_at is null or old.created_at < c.ends_at)
  loop
    if public.hof_leaderboard_row_is_cycle_induction(
      old.dungeon_id,
      old.difficulty_id,
      old.role_bucket,
      old.player_key,
      old.dps,
      old.created_at,
      old.parse_id,
      r.starts_at,
      r.ends_at
    ) then
      perform public.bump_meter_hof_cycle_summary_for_gold_row(old.player_key, old.created_at, -1);
    end if;
  end loop;

  return old;
end;
$$;

drop trigger if exists meter_hof_gold_entries_cycle_summary_insert on public.meter_hof_gold_entries;
drop trigger if exists meter_hof_gold_entries_cycle_summary_delete on public.meter_hof_gold_entries;

drop trigger if exists meter_leaderboard_entries_cycle_summary_insert on public.meter_leaderboard_entries;
create trigger meter_leaderboard_entries_cycle_summary_insert
  after insert on public.meter_leaderboard_entries
  for each row
  execute function public.meter_hof_cycle_summary_after_leaderboard_insert();

drop trigger if exists meter_leaderboard_entries_cycle_summary_delete on public.meter_leaderboard_entries;
create trigger meter_leaderboard_entries_cycle_summary_delete
  after delete on public.meter_leaderboard_entries
  for each row
  execute function public.meter_hof_cycle_summary_after_leaderboard_delete();

select public.refresh_meter_hof_cycle_summary('olympus');
select public.refresh_meter_hof_cycle_summary('magia');

grant execute on function public.hof_leaderboard_row_is_cycle_induction(
  text, int, text, text, numeric, timestamptz, uuid, timestamptz, timestamptz
) to authenticated;
grant execute on function public.get_meter_hof_gold_breaks(text, int, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_meter_player_hof_gold_breaks(text, int, timestamptz, timestamptz) to anon, authenticated;
