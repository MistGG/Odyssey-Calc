-- Party mate icons for leaderboard rows: other tamers on the same parse (not digimon swaps).

create or replace function public.member_primary_digimon_from_payload(member jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (
      select d.elem
      from jsonb_array_elements(coalesce(member->'digimons', '[]'::jsonb)) as d(elem)
      order by
        coalesce((d.elem->>'totalDamage')::numeric, 0) desc,
        coalesce(nullif(trim(d.elem->>'digimonName'), ''), d.elem->>'digimonId')
      limit 1
    ),
    jsonb_strip_nulls(
      jsonb_build_object(
        'digimonId', coalesce(nullif(trim(member->>'currentDigimonId'), ''), 'unknown'),
        'digimonName', coalesce(
          nullif(trim(member->>'currentDigimonName'), ''),
          nullif(trim(member->>'displayLabel'), ''),
          ''
        ),
        'iconId', member->>'portraitIconId',
        'portraitUrl', member->>'portraitUrl',
        'totalDamage', coalesce(member->>'totalDamage', '0')
      )
    )
  );
$$;

drop function if exists public.get_meter_leaderboard_party_digimon(text, int, timestamptz, timestamptz);
drop function if exists public.get_meter_leaderboard_party_mates(text, int, timestamptz, timestamptz);

create or replace function public.get_meter_leaderboard_party_mates(
  p_dungeon_id text,
  p_difficulty_id int,
  p_window_start timestamptz default null,
  p_window_end timestamptz default null
)
returns table (
  role_bucket text,
  player_key text,
  mate_player_key text,
  mate_display_name text,
  digimon_id text,
  digimon_name text,
  icon_id text,
  portrait_url text,
  mate_order int
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (e.role_bucket, lower(trim(e.player_key)))
      e.role_bucket,
      lower(trim(e.player_key)) as player_key,
      e.parse_id
    from public.meter_leaderboard_entries e
    where e.dungeon_id = trim(p_dungeon_id)
      and e.difficulty_id = p_difficulty_id
      and e.dps > 0
      and e.role_bucket is not null
      and e.player_key is not null
      and trim(e.player_key) <> ''
      and (p_window_start is null or e.created_at >= p_window_start)
      and (p_window_end is null or e.created_at < p_window_end)
    order by e.role_bucket, lower(trim(e.player_key)), e.dps desc, e.created_at desc
  ),
  parse_members as (
    select
      b.role_bucket,
      b.player_key,
      m.member,
      public.member_player_key_from_payload(m.member) as member_key
    from best b
    join public.meter_parses p on p.id = b.parse_id
    cross join lateral jsonb_array_elements(coalesce(p.payload->'members', '[]'::jsonb)) as m(member)
  ),
  mates as (
    select
      pm.role_bucket,
      pm.player_key,
      pm.member,
      pm.member_key as mate_player_key,
      coalesce(
        nullif(trim(pm.member->>'tamerName'), ''),
        nullif(trim(pm.member->>'displayLabel'), ''),
        pm.member_key
      ) as mate_display_name,
      row_number() over (
        partition by pm.role_bucket, pm.player_key
        order by coalesce((pm.member->>'totalDamage')::numeric, 0) desc, pm.member_key
      )::int as mate_order
    from parse_members pm
    where pm.member_key <> ''
      and pm.member_key <> pm.player_key
  )
  select
    m.role_bucket,
    m.player_key,
    m.mate_player_key,
    m.mate_display_name,
    coalesce(nullif(trim(d.primary->>'digimonId'), ''), '') as digimon_id,
    coalesce(nullif(trim(d.primary->>'digimonName'), ''), '') as digimon_name,
    nullif(
      trim(coalesce(d.primary->>'iconId', d.primary->>'portraitIconId')),
      ''
    ) as icon_id,
    nullif(trim(d.primary->>'portraitUrl'), '') as portrait_url,
    m.mate_order
  from mates m
  cross join lateral (
    select public.member_primary_digimon_from_payload(m.member) as primary
  ) d
  where coalesce(nullif(trim(d.primary->>'digimonId'), ''), '') <> ''
    and coalesce(nullif(trim(d.primary->>'digimonId'), ''), '') <> 'unknown'
  order by m.role_bucket, m.player_key, m.mate_order;
$$;

grant execute on function public.get_meter_leaderboard_party_mates(text, int, timestamptz, timestamptz) to anon, authenticated;
