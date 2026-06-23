-- Party digimon icons for leaderboard rows (reads parse payloads server-side).

create or replace function public.member_player_key_from_payload(member jsonb)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(nullif(trim(member->>'tamerName'), ''), member->>'displayLabel', '')));
$$;

create or replace function public.get_meter_leaderboard_party_digimon(
  p_dungeon_id text,
  p_difficulty_id int,
  p_window_start timestamptz default null,
  p_window_end timestamptz default null
)
returns table (
  role_bucket text,
  player_key text,
  digimon_id text,
  digimon_name text,
  icon_id text,
  portrait_url text,
  damage_rank int
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
  matched_members as (
    select
      b.role_bucket,
      b.player_key,
      m.member
    from best b
    join public.meter_parses p on p.id = b.parse_id
    cross join lateral jsonb_array_elements(coalesce(p.payload->'members', '[]'::jsonb)) as m(member)
    where public.member_player_key_from_payload(m.member) = b.player_key
  ),
  digimon_rows as (
    select
      mm.role_bucket,
      mm.player_key,
      d.digimon,
      row_number() over (
        partition by mm.role_bucket, mm.player_key
        order by coalesce((d.digimon->>'totalDamage')::numeric, 0) desc,
          coalesce(nullif(trim(d.digimon->>'digimonName'), ''), d.digimon->>'digimonId')
      )::int as damage_rank
    from matched_members mm
    cross join lateral jsonb_array_elements(
      case
        when jsonb_array_length(coalesce(mm.member->'digimons', '[]'::jsonb)) > 0 then mm.member->'digimons'
        else jsonb_build_array(
          jsonb_strip_nulls(
            jsonb_build_object(
              'digimonId', coalesce(nullif(trim(mm.member->>'currentDigimonId'), ''), 'unknown'),
              'digimonName', coalesce(
                nullif(trim(mm.member->>'currentDigimonName'), ''),
                nullif(trim(mm.member->>'displayLabel'), ''),
                ''
              ),
              'iconId', mm.member->>'portraitIconId',
              'portraitUrl', mm.member->>'portraitUrl',
              'totalDamage', coalesce(mm.member->>'totalDamage', '0')
            )
          )
        )
      end
    ) as d(digimon)
  )
  select
    dr.role_bucket,
    dr.player_key,
    coalesce(nullif(trim(dr.digimon->>'digimonId'), ''), '') as digimon_id,
    coalesce(nullif(trim(dr.digimon->>'digimonName'), ''), '') as digimon_name,
    nullif(trim(dr.digimon->>'iconId'), '') as icon_id,
    nullif(trim(dr.digimon->>'portraitUrl'), '') as portrait_url,
    dr.damage_rank
  from digimon_rows dr
  where coalesce(nullif(trim(dr.digimon->>'digimonId'), ''), '') <> ''
    and coalesce(nullif(trim(dr.digimon->>'digimonId'), ''), '') <> 'unknown'
  order by dr.role_bucket, dr.player_key, dr.damage_rank;
$$;

grant execute on function public.get_meter_leaderboard_party_digimon(text, int, timestamptz, timestamptz) to anon, authenticated;
