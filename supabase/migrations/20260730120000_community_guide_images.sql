-- Durable community guide images (thumbnails + body embeds) in Supabase Storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guide-images',
  'guide-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.community_guide_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  guide_id uuid references public.community_guides (id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  source_url text,
  content_type text not null,
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now()
);

create index if not exists community_guide_images_owner_idx
  on public.community_guide_images (owner_id, created_at desc);

create index if not exists community_guide_images_guide_idx
  on public.community_guide_images (guide_id)
  where guide_id is not null;

create index if not exists community_guide_images_public_url_idx
  on public.community_guide_images (public_url);

comment on table public.community_guide_images is
  'Owned copies of guide thumbnails/body images so remote hosts cannot break guides.';

alter table public.community_guide_images enable row level security;

drop policy if exists community_guide_images_public_read on public.community_guide_images;
create policy community_guide_images_public_read on public.community_guide_images
  for select
  using (true);

drop policy if exists community_guide_images_owner_insert on public.community_guide_images;
create policy community_guide_images_owner_insert on public.community_guide_images
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists community_guide_images_owner_or_editor_update on public.community_guide_images;
create policy community_guide_images_owner_or_editor_update on public.community_guide_images
  for update
  to authenticated
  using (
    owner_id = auth.uid()
    or (guide_id is not null and public.can_edit_community_guide(guide_id))
  )
  with check (
    owner_id = auth.uid()
    or (guide_id is not null and public.can_edit_community_guide(guide_id))
  );

drop policy if exists community_guide_images_owner_or_editor_delete on public.community_guide_images;
create policy community_guide_images_owner_or_editor_delete on public.community_guide_images
  for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or (guide_id is not null and public.can_edit_community_guide(guide_id))
  );

-- Storage policies: public read; write/delete only under own user_id prefix.
drop policy if exists guide_images_public_read on storage.objects;
create policy guide_images_public_read on storage.objects
  for select
  using (bucket_id = 'guide-images');

drop policy if exists guide_images_owner_insert on storage.objects;
create policy guide_images_owner_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'guide-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists guide_images_owner_update on storage.objects;
create policy guide_images_owner_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'guide-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'guide-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists guide_images_owner_delete on storage.objects;
create policy guide_images_owner_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'guide-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Editors may delete storage objects for images attached to guides they can edit.
drop policy if exists guide_images_editor_delete on storage.objects;
create policy guide_images_editor_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'guide-images'
    and exists (
      select 1
      from public.community_guide_images i
      where i.storage_path = name
        and i.guide_id is not null
        and public.can_edit_community_guide(i.guide_id)
    )
  );
