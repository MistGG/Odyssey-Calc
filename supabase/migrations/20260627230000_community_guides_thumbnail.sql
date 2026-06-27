-- Optional cover image for community guide cards.

alter table public.community_guides
  add column if not exists thumbnail_url text;

comment on column public.community_guides.thumbnail_url is
  'Optional https image URL shown on guide list cards.';
