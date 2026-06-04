-- Public meter reads must not expose full parse payloads (PostgREST egress + scraping).
-- The site reads meter_parses_public; authenticated users still read meter_parses for own uploads.

create or replace view public.meter_parses_public as
select
  id,
  created_at,
  duration_sec,
  app_version,
  total_damage,
  hit_count,
  parse_kind,
  dungeon_id,
  dungeon_name,
  difficulty,
  difficulty_id,
  leaderboard_summary
from public.meter_parses
where parse_kind = 'dungeon_party';

grant select on public.meter_parses_public to anon, authenticated;

revoke select on public.meter_parses from anon;

create or replace function public.get_meter_site_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total_parses',
    (select count(*)::int from public.meter_parses where parse_kind = 'dungeon_party'),
    'unique_tamers',
    (
      select count(distinct lower(trim(player_key)))::int
      from public.meter_leaderboard_entries
      where player_key is not null and trim(player_key) <> ''
    ),
    'role_counts',
    coalesce(
      (
        select json_object_agg(role_bucket, cnt)
        from (
          select
            role_bucket,
            count(distinct lower(trim(player_key)))::int as cnt
          from public.meter_leaderboard_entries
          where role_bucket is not null
            and player_key is not null
            and trim(player_key) <> ''
          group by role_bucket
        ) role_stats
      ),
      '{}'::json
    )
  );
$$;

grant execute on function public.get_meter_site_stats() to anon, authenticated;
