-- Public community guides with hearts for visibility ranking.

create table if not exists public.community_guides (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null,
  title text not null,
  slug text not null,
  body text not null default '',
  heart_count integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_guides_slug_unique unique (slug)
);

create index if not exists community_guides_published_hearts_idx
  on public.community_guides (status, heart_count desc, updated_at desc);

create table if not exists public.community_guide_hearts (
  guide_id uuid not null references public.community_guides (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guide_id, user_id)
);

create or replace function public.sync_community_guide_heart_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_guides
    set heart_count = heart_count + 1,
        updated_at = now()
    where id = new.guide_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_guides
    set heart_count = greatest(0, heart_count - 1),
        updated_at = now()
    where id = old.guide_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists community_guide_hearts_count_trg on public.community_guide_hearts;
create trigger community_guide_hearts_count_trg
after insert or delete on public.community_guide_hearts
for each row execute function public.sync_community_guide_heart_count();

alter table public.community_guides enable row level security;
alter table public.community_guide_hearts enable row level security;

drop policy if exists community_guides_public_read on public.community_guides;
create policy community_guides_public_read on public.community_guides
  for select
  using (status = 'published' or author_id = auth.uid());

drop policy if exists community_guides_author_insert on public.community_guides;
create policy community_guides_author_insert on public.community_guides
  for insert
  with check (auth.uid() = author_id);

drop policy if exists community_guides_author_update on public.community_guides;
create policy community_guides_author_update on public.community_guides
  for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists community_guides_author_delete on public.community_guides;
create policy community_guides_author_delete on public.community_guides
  for delete
  using (auth.uid() = author_id);

drop policy if exists community_guide_hearts_public_read on public.community_guide_hearts;
create policy community_guide_hearts_public_read on public.community_guide_hearts
  for select
  using (true);

drop policy if exists community_guide_hearts_user_insert on public.community_guide_hearts;
create policy community_guide_hearts_user_insert on public.community_guide_hearts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists community_guide_hearts_user_delete on public.community_guide_hearts;
create policy community_guide_hearts_user_delete on public.community_guide_hearts
  for delete
  using (auth.uid() = user_id);

grant select on public.community_guides to anon, authenticated;
grant insert, update, delete on public.community_guides to authenticated;
grant select, insert, delete on public.community_guide_hearts to authenticated;
