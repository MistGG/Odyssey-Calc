-- Close Magia cycle / open Verdandi cycle.
-- Keep in sync with src/lib/meterLeaderboardCycles.ts
-- Magia ends / Verdandi starts: July 23, 2026 00:00 Arizona (UTC−7) = 2026-07-23T07:00:00.000Z

insert into public.meter_leaderboard_cycles (id, starts_at, ends_at, finalized)
values
  ('magia', '2026-06-16T00:30:00.000Z', '2026-07-23T07:00:00.000Z', true),
  ('verdandi', '2026-07-23T07:00:00.000Z', null, false)
on conflict (id) do update
set
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  finalized = excluded.finalized;

-- Rebuild Magia summary with closed window; seed empty Verdandi summary.
select public.refresh_meter_hof_cycle_summary('magia');
select public.refresh_meter_hof_cycle_summary('verdandi');
