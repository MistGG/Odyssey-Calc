-- Track guide page views and expose a safe increment RPC.

alter table public.community_guides
  add column if not exists view_count integer not null default 0;

comment on column public.community_guides.view_count is
  'Number of guide detail page views.';

create index if not exists community_guides_published_views_idx
  on public.community_guides (status, view_count desc, updated_at desc);

create or replace function public.increment_community_guide_view(p_guide_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.community_guides
  set view_count = view_count + 1
  where id = p_guide_id
    and status = 'published'
  returning view_count into new_count;

  return coalesce(new_count, 0);
end;
$$;

grant execute on function public.increment_community_guide_view(uuid) to anon, authenticated;
