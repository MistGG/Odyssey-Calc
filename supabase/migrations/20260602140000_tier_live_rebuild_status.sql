alter table public.tier_list_live
  add column if not exists rebuilding_at timestamptz,
  add column if not exists rebuild_done integer,
  add column if not exists rebuild_total integer;
