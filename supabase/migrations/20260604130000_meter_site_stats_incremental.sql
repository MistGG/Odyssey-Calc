-- Incremental site stats: avoid full-table count(*) on every get_meter_site_stats() call.

create table if not exists public.meter_site_stats_snapshot (
  id int primary key default 1 check (id = 1),
  total_parses bigint not null default 0,
  unique_tamers bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.meter_site_known_tamers (
  player_key text primary key
);

create table if not exists public.meter_site_role_tamers (
  role_bucket text not null,
  player_key text not null,
  primary key (role_bucket, player_key)
);

insert into public.meter_site_stats_snapshot (id, total_parses, unique_tamers)
values (1, 0, 0)
on conflict (id) do nothing;

-- One-time backfill from existing data.
insert into public.meter_site_known_tamers (player_key)
select distinct lower(trim(player_key))
from public.meter_leaderboard_entries
where player_key is not null and trim(player_key) <> ''
on conflict do nothing;

insert into public.meter_site_role_tamers (role_bucket, player_key)
select distinct role_bucket, lower(trim(player_key))
from public.meter_leaderboard_entries
where role_bucket is not null
  and player_key is not null
  and trim(player_key) <> ''
on conflict do nothing;

update public.meter_site_stats_snapshot
set
  total_parses = (
    select count(*)::bigint from public.meter_parses where parse_kind = 'dungeon_party'
  ),
  unique_tamers = (select count(*)::bigint from public.meter_site_known_tamers),
  updated_at = now()
where id = 1;

create or replace function public.meter_bump_site_stats_on_parse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parse_kind = 'dungeon_party' then
    update public.meter_site_stats_snapshot
    set total_parses = total_parses + 1, updated_at = now()
    where id = 1;
  end if;
  return new;
end;
$$;

create or replace function public.meter_bump_site_stats_on_leaderboard_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  v_key := lower(trim(new.player_key));
  if v_key = '' or new.role_bucket is null then
    return new;
  end if;

  insert into public.meter_site_known_tamers (player_key)
  values (v_key)
  on conflict do nothing;

  if found then
    update public.meter_site_stats_snapshot
    set unique_tamers = unique_tamers + 1, updated_at = now()
    where id = 1;
  end if;

  insert into public.meter_site_role_tamers (role_bucket, player_key)
  values (new.role_bucket, v_key)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists meter_site_stats_on_parse on public.meter_parses;
create trigger meter_site_stats_on_parse
  after insert on public.meter_parses
  for each row
  execute function public.meter_bump_site_stats_on_parse();

drop trigger if exists meter_site_stats_on_leaderboard_entry on public.meter_leaderboard_entries;
create trigger meter_site_stats_on_leaderboard_entry
  after insert on public.meter_leaderboard_entries
  for each row
  execute function public.meter_bump_site_stats_on_leaderboard_entry();

create or replace function public.get_meter_site_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total_parses',
    coalesce((select total_parses::int from public.meter_site_stats_snapshot where id = 1), 0),
    'unique_tamers',
    coalesce((select unique_tamers::int from public.meter_site_stats_snapshot where id = 1), 0),
    'role_counts',
    coalesce(
      (
        select json_object_agg(role_bucket, cnt)
        from (
          select role_bucket, count(*)::int as cnt
          from public.meter_site_role_tamers
          group by role_bucket
        ) role_stats
      ),
      '{}'::json
    )
  );
$$;

grant select on public.meter_site_stats_snapshot to anon, authenticated;
grant select on public.meter_site_known_tamers to anon, authenticated;
grant select on public.meter_site_role_tamers to anon, authenticated;
