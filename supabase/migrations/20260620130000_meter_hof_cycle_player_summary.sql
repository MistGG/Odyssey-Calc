-- Per-player Hall of Fame induction counts per leaderboard cycle (O(1) badge reads).
-- Cycle windows live in meter_leaderboard_cycles — keep in sync with src/lib/meterLeaderboardCycles.ts.

create table if not exists public.meter_leaderboard_cycles (
  id text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  finalized boolean not null default false
);

insert into public.meter_leaderboard_cycles (id, starts_at, ends_at, finalized)
values
  ('olympus', '2026-04-20T07:00:00.000Z', '2026-06-16T00:30:00.000Z', true),
  ('magia', '2026-06-16T00:30:00.000Z', null, false)
on conflict (id) do update
set
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  finalized = excluded.finalized;

create table if not exists public.meter_hof_cycle_player_summary (
  cycle_id text not null references public.meter_leaderboard_cycles (id) on delete cascade,
  player_key text not null,
  induction_count int not null default 0,
  updated_at timestamptz not null default now(),
  constraint meter_hof_cycle_player_summary_count_chk check (induction_count >= 0),
  primary key (cycle_id, player_key)
);

create index if not exists meter_hof_cycle_player_summary_player_idx
  on public.meter_hof_cycle_player_summary (player_key);

alter table public.meter_hof_cycle_player_summary enable row level security;

drop policy if exists "meter hof cycle summary read" on public.meter_hof_cycle_player_summary;
create policy "meter hof cycle summary read"
  on public.meter_hof_cycle_player_summary
  for select
  using (true);

-- Rebuild summary rows for one cycle from meter_hof_gold_entries.
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
  group by h.player_key;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Increment / decrement helpers (maintained by triggers on meter_hof_gold_entries).
create or replace function public.bump_meter_hof_cycle_summary_for_gold_row(
  p_player_key text,
  p_created_at timestamptz,
  p_delta int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_key text := lower(trim(p_player_key));
begin
  if v_player_key = '' or p_delta = 0 then
    return;
  end if;

  insert into public.meter_hof_cycle_player_summary (cycle_id, player_key, induction_count, updated_at)
  select
    c.id,
    v_player_key,
    p_delta,
    now()
  from public.meter_leaderboard_cycles c
  where p_created_at >= c.starts_at
    and (c.ends_at is null or p_created_at < c.ends_at)
  on conflict (cycle_id, player_key) do update
  set
    induction_count = greatest(0, public.meter_hof_cycle_player_summary.induction_count + p_delta),
    updated_at = now();
end;
$$;

create or replace function public.meter_hof_cycle_summary_after_gold_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_meter_hof_cycle_summary_for_gold_row(new.player_key, new.created_at, 1);
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
  perform public.bump_meter_hof_cycle_summary_for_gold_row(old.player_key, old.created_at, -1);
  return old;
end;
$$;

drop trigger if exists meter_hof_gold_entries_cycle_summary_insert on public.meter_hof_gold_entries;
create trigger meter_hof_gold_entries_cycle_summary_insert
  after insert on public.meter_hof_gold_entries
  for each row
  execute function public.meter_hof_cycle_summary_after_gold_insert();

drop trigger if exists meter_hof_gold_entries_cycle_summary_delete on public.meter_hof_gold_entries;
create trigger meter_hof_gold_entries_cycle_summary_delete
  after delete on public.meter_hof_gold_entries
  for each row
  execute function public.meter_hof_cycle_summary_after_gold_delete();

select public.refresh_meter_hof_cycle_summary('olympus');
select public.refresh_meter_hof_cycle_summary('magia');

create or replace function public.get_meter_player_hof_cycle_counts(p_player_key text)
returns table (
  cycle_id text,
  induction_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.cycle_id,
    s.induction_count
  from public.meter_hof_cycle_player_summary s
  where s.player_key = lower(trim(p_player_key))
    and s.induction_count > 0
  order by s.cycle_id;
$$;

grant execute on function public.refresh_meter_hof_cycle_summary(text) to authenticated;
grant execute on function public.get_meter_player_hof_cycle_counts(text) to anon, authenticated;
