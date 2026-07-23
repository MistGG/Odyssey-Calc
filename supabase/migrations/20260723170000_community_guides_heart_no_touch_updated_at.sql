-- Hearting a guide should not mark it as content-updated (breaks collab sync + "Updated" stamps).

create or replace function public.sync_community_guide_heart_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_guides
    set heart_count = heart_count + 1
    where id = new.guide_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_guides
    set heart_count = greatest(0, heart_count - 1)
    where id = old.guide_id;
    return old;
  end if;
  return null;
end;
$$;
