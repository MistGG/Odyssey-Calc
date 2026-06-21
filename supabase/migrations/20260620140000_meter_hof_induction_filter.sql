-- HoF induction rule: count a gold row only when the breaker takes the record from
-- someone else (or sets the first role record). Self-improvements while still holding
-- the record are excluded from cycle summaries and trigger bumps.

create or replace function public.hof_gold_row_is_induction(
  p_dungeon_id text,
  p_difficulty_id int,
  p_role_bucket text,
  p_player_key text,
  p_dps numeric,
  p_created_at timestamptz,
  p_parse_id uuid
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
  if v_player = '' or p_dps <= 0 then
    return false;
  end if;

  for r in
    select
      lower(trim(h.player_key)) as player_key,
      h.dps
    from public.meter_hof_gold_entries h
    where h.dungeon_id = trim(p_dungeon_id)
      and h.difficulty_id = p_difficulty_id
      and h.role_bucket = p_role_bucket
      and (
        h.created_at < p_created_at
        or (h.created_at = p_created_at and h.parse_id < p_parse_id)
        or (
          h.created_at = p_created_at
          and h.parse_id = p_parse_id
          and lower(trim(h.player_key)) < v_player
        )
      )
    order by h.created_at, h.parse_id, lower(trim(h.player_key))
  loop
    if r.dps <= v_running_max then
      continue;
    end if;
    if v_holder is not null and v_holder = r.player_key then
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
    h.player_key,
    count(*)::int,
    now()
  from public.meter_hof_gold_entries h
  where h.created_at >= v_starts
    and (v_ends is null or h.created_at < v_ends)
    and public.hof_gold_row_is_induction(
      h.dungeon_id,
      h.difficulty_id,
      h.role_bucket,
      h.player_key,
      h.dps,
      h.created_at,
      h.parse_id
    )
  group by h.player_key;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.meter_hof_cycle_summary_after_gold_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.hof_gold_row_is_induction(
    new.dungeon_id,
    new.difficulty_id,
    new.role_bucket,
    new.player_key,
    new.dps,
    new.created_at,
    new.parse_id
  ) then
    perform public.bump_meter_hof_cycle_summary_for_gold_row(new.player_key, new.created_at, 1);
  end if;
  return new;
end;
$$;

create or replace function public.meter_hof_cycle_summary_after_gold_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.hof_gold_row_is_induction(
    old.dungeon_id,
    old.difficulty_id,
    old.role_bucket,
    old.player_key,
    old.dps,
    old.created_at,
    old.parse_id
  ) then
    perform public.bump_meter_hof_cycle_summary_for_gold_row(old.player_key, old.created_at, -1);
  end if;
  return old;
end;
$$;

select public.refresh_meter_hof_cycle_summary('olympus');
select public.refresh_meter_hof_cycle_summary('magia');

grant execute on function public.hof_gold_row_is_induction(text, int, text, text, numeric, timestamptz, uuid) to authenticated;
