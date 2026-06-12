-- Persist uploader tamer key for grant eligibility when list queries omit payloads.

alter table public.meter_reward_accounts
  add column if not exists confirmed_player_key text;

comment on column public.meter_reward_accounts.confirmed_player_key is
  'Lowercase tamer key from isSelf uploads; used for meter point grants when only leaderboard_summary is loaded.';
