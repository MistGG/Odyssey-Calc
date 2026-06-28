-- Optional author social links shown on community guide pages.

alter table public.community_guides
  add column if not exists social_links jsonb not null default '[]'::jsonb;

comment on column public.community_guides.social_links is
  'Array of {platform, url} objects for author YouTube, Twitch, etc.';
