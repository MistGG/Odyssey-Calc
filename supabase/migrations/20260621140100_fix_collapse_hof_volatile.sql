-- collapse_hof_induction_rows uses temp tables; must not be STABLE.

create or replace function public.collapse_hof_induction_rows(
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
security definer
set search_path = public
as $$
declare
  r record;
  v_player text;
  v_running_max numeric;
  v_holder text;
  v_last_ord int;
  v_ord int := 0;
begin
  create temp table if not exists _hof_collapsed (
    ord int primary key,
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
  ) on commit drop;

  create temp table if not exists _hof_role_state (
    role_bucket text primary key,
    running_max numeric not null default 0,
    holder text,
    last_ord int
  ) on commit drop;

  truncate _hof_collapsed;
  truncate _hof_role_state;

  insert into _hof_role_state (role_bucket)
  values ('melee'), ('ranged'), ('caster'), ('hybrid'), ('tank'), ('healer');

  if p_window_start is null then
    for r in
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
        h.portrait_url
      from public.meter_hof_gold_entries h
      where h.dungeon_id = trim(p_dungeon_id)
        and h.difficulty_id = p_difficulty_id
      order by h.created_at, h.parse_id, lower(trim(h.player_key))
    loop
      select s.running_max, s.holder, s.last_ord
      into v_running_max, v_holder, v_last_ord
      from _hof_role_state s
      where s.role_bucket = r.role_bucket;

      if r.dps <= v_running_max then
        continue;
      end if;

      v_player := r.player_key;

      if v_holder is not null and v_holder = v_player then
        update _hof_collapsed c
        set
          parse_id = r.parse_id,
          created_at = r.created_at,
          display_name = r.display_name,
          dps = r.dps,
          digimon_id = r.digimon_id,
          digimon_name = r.digimon_name,
          icon_id = r.icon_id,
          portrait_url = r.portrait_url
        where c.ord = v_last_ord;

        update _hof_role_state s
        set running_max = r.dps
        where s.role_bucket = r.role_bucket;

        continue;
      end if;

      v_ord := v_ord + 1;

      insert into _hof_collapsed (
        ord,
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
      )
      values (
        v_ord,
        r.parse_id,
        r.created_at,
        r.role_bucket,
        r.player_key,
        r.display_name,
        r.dps,
        r.digimon_id,
        r.digimon_name,
        r.icon_id,
        r.portrait_url
      );

      update _hof_role_state s
      set
        running_max = r.dps,
        holder = v_player,
        last_ord = v_ord
      where s.role_bucket = r.role_bucket;
    end loop;
  else
    for r in
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
        coalesce(nullif(trim(w.display_name), ''), w.player_key) as display_name,
        w.dps,
        coalesce(w.digimon_id, '') as digimon_id,
        coalesce(w.digimon_name, '') as digimon_name,
        w.icon_id,
        w.portrait_url
      from with_prior w
      where w.dps > w.prior_max_dps
      order by w.created_at, w.parse_id, w.player_key
    loop
      select s.running_max, s.holder, s.last_ord
      into v_running_max, v_holder, v_last_ord
      from _hof_role_state s
      where s.role_bucket = r.role_bucket;

      if r.dps <= v_running_max then
        continue;
      end if;

      v_player := r.player_key;

      if v_holder is not null and v_holder = v_player then
        update _hof_collapsed c
        set
          parse_id = r.parse_id,
          created_at = r.created_at,
          display_name = r.display_name,
          dps = r.dps,
          digimon_id = r.digimon_id,
          digimon_name = r.digimon_name,
          icon_id = r.icon_id,
          portrait_url = r.portrait_url
        where c.ord = v_last_ord;

        update _hof_role_state s
        set running_max = r.dps
        where s.role_bucket = r.role_bucket;

        continue;
      end if;

      v_ord := v_ord + 1;

      insert into _hof_collapsed (
        ord,
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
      )
      values (
        v_ord,
        r.parse_id,
        r.created_at,
        r.role_bucket,
        r.player_key,
        r.display_name,
        r.dps,
        r.digimon_id,
        r.digimon_name,
        r.icon_id,
        r.portrait_url
      );

      update _hof_role_state s
      set
        running_max = r.dps,
        holder = v_player,
        last_ord = v_ord
      where s.role_bucket = r.role_bucket;
    end loop;
  end if;

  return query
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
    c.portrait_url
  from _hof_collapsed c
  order by c.created_at desc;
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
language sql
security definer
set search_path = public
as $$
  select *
  from public.collapse_hof_induction_rows(
    p_dungeon_id,
    p_difficulty_id,
    p_window_start,
    p_window_end
  );
$$;
