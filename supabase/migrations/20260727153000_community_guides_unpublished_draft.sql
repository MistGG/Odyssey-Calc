-- Keep published guide content live while authors save unpublished WIP.

alter table public.community_guides
  add column if not exists has_unpublished_draft boolean not null default false,
  add column if not exists draft_title text,
  add column if not exists draft_body text,
  add column if not exists draft_thumbnail_url text,
  add column if not exists draft_social_links jsonb;

comment on column public.community_guides.has_unpublished_draft is
  'When true on a published guide, draft_* holds WIP that is not shown publicly until publish.';
