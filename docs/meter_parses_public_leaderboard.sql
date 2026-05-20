-- Public Meter leaderboard (Odyssey Calc → /meter)
-- Run once in Supabase SQL Editor for the project linked to VITE_SUPABASE_*.
--
-- Symptom without this: signed-out users see "permission denied for table meter_parses";
-- signed-in users only see their own uploads, not the public leaderboard.
--
-- Keeps insert/update/delete restricted to the uploader; adds read access for
-- dungeon_party parses (Normal+ enforced on upload via meter_parses_dungeon_upload_ck).

grant select on table public.meter_parses to anon, authenticated;

drop policy if exists meter_parses_select_dungeon_party_public on public.meter_parses;

create policy meter_parses_select_dungeon_party_public
  on public.meter_parses
  for select
  to anon, authenticated
  using (
    parse_kind = 'dungeon_party'
    and difficulty_id is not null
    and difficulty_id >= 2
  );
