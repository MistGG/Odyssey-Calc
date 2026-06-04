-- Tier list is served from static JSON on GitHub Pages (public/data/tier-list-live.json).
-- PostgREST reads of tier_list_live.cache were ~2 MB each and dominated egress.

drop policy if exists "tier live read" on public.tier_list_live;
drop policy if exists "tier live write authenticated" on public.tier_list_live;
drop policy if exists "tier sync state read" on public.tier_sync_state;
drop policy if exists "tier recompute runs read" on public.tier_recompute_runs;
drop policy if exists "tier recompute runs write authenticated" on public.tier_recompute_runs;
drop policy if exists "tier sync runs read" on public.tier_sync_runs;

revoke all on table public.tier_list_live from anon, authenticated;
revoke all on table public.tier_sync_state from anon, authenticated;
revoke all on table public.tier_recompute_runs from anon, authenticated;
revoke all on table public.tier_sync_runs from anon, authenticated;
