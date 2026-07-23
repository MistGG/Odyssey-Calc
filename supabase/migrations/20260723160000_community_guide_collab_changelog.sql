-- Guide collaboration invites + public changelog entries.

create table if not exists public.community_guide_collaborators (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.community_guides (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'editor' check (role in ('editor')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invite_token text,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint community_guide_collaborators_token_unique unique (invite_token)
);

create unique index if not exists community_guide_collaborators_accepted_user_uidx
  on public.community_guide_collaborators (guide_id, user_id)
  where user_id is not null and status = 'accepted';

create index if not exists community_guide_collaborators_guide_idx
  on public.community_guide_collaborators (guide_id, status);

create index if not exists community_guide_collaborators_user_idx
  on public.community_guide_collaborators (user_id, status)
  where user_id is not null;

create table if not exists public.community_guide_changelog (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.community_guides (id) on delete cascade,
  editor_id uuid references auth.users (id) on delete set null,
  editor_name text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_guide_changelog_guide_created_idx
  on public.community_guide_changelog (guide_id, created_at desc);

create or replace function public.is_community_guide_author(p_guide_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_guides g
    where g.id = p_guide_id
      and g.author_id = auth.uid()
  );
$$;

create or replace function public.is_community_guide_collaborator(p_guide_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_guide_collaborators c
    where c.guide_id = p_guide_id
      and c.user_id = auth.uid()
      and c.status = 'accepted'
  );
$$;

create or replace function public.can_edit_community_guide(p_guide_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_community_guide_author(p_guide_id)
      or public.is_community_guide_collaborator(p_guide_id);
$$;

grant execute on function public.is_community_guide_author(uuid) to anon, authenticated;
grant execute on function public.is_community_guide_collaborator(uuid) to anon, authenticated;
grant execute on function public.can_edit_community_guide(uuid) to anon, authenticated;

-- Allow authors and accepted collaborators to read drafts / edit content.
drop policy if exists community_guides_public_read on public.community_guides;
create policy community_guides_public_read on public.community_guides
  for select
  using (
    status = 'published'
    or author_id = auth.uid()
    or public.is_community_guide_collaborator(id)
  );

drop policy if exists community_guides_author_update on public.community_guides;
create policy community_guides_author_update on public.community_guides
  for update
  using (public.can_edit_community_guide(id))
  with check (public.can_edit_community_guide(id));

alter table public.community_guide_collaborators enable row level security;
alter table public.community_guide_changelog enable row level security;

drop policy if exists community_guide_collaborators_select on public.community_guide_collaborators;
create policy community_guide_collaborators_select on public.community_guide_collaborators
  for select
  using (
    public.is_community_guide_author(guide_id)
    or user_id = auth.uid()
    or (
      status = 'accepted'
      and exists (
        select 1
        from public.community_guides g
        where g.id = guide_id
          and g.status = 'published'
      )
    )
  );

drop policy if exists community_guide_collaborators_author_insert on public.community_guide_collaborators;
create policy community_guide_collaborators_author_insert on public.community_guide_collaborators
  for insert
  with check (
    public.is_community_guide_author(guide_id)
    and invited_by = auth.uid()
  );

drop policy if exists community_guide_collaborators_author_update on public.community_guide_collaborators;
create policy community_guide_collaborators_author_update on public.community_guide_collaborators
  for update
  using (
    public.is_community_guide_author(guide_id)
    or user_id = auth.uid()
  )
  with check (
    public.is_community_guide_author(guide_id)
    or user_id = auth.uid()
  );

drop policy if exists community_guide_collaborators_author_delete on public.community_guide_collaborators;
create policy community_guide_collaborators_author_delete on public.community_guide_collaborators
  for delete
  using (
    public.is_community_guide_author(guide_id)
    or user_id = auth.uid()
  );

drop policy if exists community_guide_changelog_select on public.community_guide_changelog;
create policy community_guide_changelog_select on public.community_guide_changelog
  for select
  using (
    exists (
      select 1
      from public.community_guides g
      where g.id = guide_id
        and (
          g.status = 'published'
          or g.author_id = auth.uid()
          or public.is_community_guide_collaborator(g.id)
        )
    )
  );

drop policy if exists community_guide_changelog_insert on public.community_guide_changelog;
create policy community_guide_changelog_insert on public.community_guide_changelog
  for insert
  with check (
    public.can_edit_community_guide(guide_id)
    and (editor_id is null or editor_id = auth.uid())
  );

drop policy if exists community_guide_changelog_delete on public.community_guide_changelog;
create policy community_guide_changelog_delete on public.community_guide_changelog
  for delete
  using (public.is_community_guide_author(guide_id));

grant select on public.community_guide_collaborators to anon, authenticated;
grant insert, update, delete on public.community_guide_collaborators to authenticated;
grant select on public.community_guide_changelog to anon, authenticated;
grant insert, delete on public.community_guide_changelog to authenticated;

-- Create an open invite link (or target a player by display name).
create or replace function public.create_community_guide_invite(
  p_guide_id uuid,
  p_display_name text default null
)
returns public.community_guide_collaborators
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_invitee uuid;
  v_invitee_name text := '';
  v_row public.community_guide_collaborators;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_community_guide_author(p_guide_id) then
    raise exception 'Only the guide owner can invite collaborators';
  end if;

  if v_name is not null then
    select p.id, coalesce(nullif(trim(p.display_name), ''), 'Player')
      into v_invitee, v_invitee_name
    from public.profiles p
    where lower(trim(p.display_name)) = lower(v_name)
    order by p.display_name
    limit 1;

    if v_invitee is null then
      raise exception 'No player found with that display name';
    end if;

    if v_invitee = v_uid then
      raise exception 'You already own this guide';
    end if;

    if exists (
      select 1
      from public.community_guide_collaborators c
      where c.guide_id = p_guide_id
        and c.user_id = v_invitee
        and c.status = 'accepted'
    ) then
      raise exception 'That player is already a collaborator';
    end if;

    -- Refresh any existing pending invite for this user.
    update public.community_guide_collaborators
    set status = 'revoked',
        invite_token = null
    where guide_id = p_guide_id
      and user_id = v_invitee
      and status = 'pending';
  end if;

  insert into public.community_guide_collaborators (
    guide_id,
    user_id,
    display_name,
    role,
    status,
    invite_token,
    invited_by
  )
  values (
    p_guide_id,
    v_invitee,
    coalesce(v_invitee_name, ''),
    'editor',
    'pending',
    -- Avoid gen_random_bytes (pgcrypto may be in extensions schema / unavailable).
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.accept_community_guide_invite(p_token text)
returns public.community_guide_collaborators
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_name text;
  v_row public.community_guide_collaborators;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_token is null then
    raise exception 'Invite token is required';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), 'Player')
    into v_name
  from public.profiles p
  where p.id = v_uid;

  v_name := coalesce(v_name, 'Player');

  select *
    into v_row
  from public.community_guide_collaborators c
  where c.invite_token = v_token
    and c.status = 'pending'
  for update;

  if v_row.id is null then
    raise exception 'Invite not found or already used';
  end if;

  if public.is_community_guide_author(v_row.guide_id) then
    raise exception 'You already own this guide';
  end if;

  if v_row.user_id is not null and v_row.user_id <> v_uid then
    raise exception 'This invite was sent to a different player';
  end if;

  if exists (
    select 1
    from public.community_guide_collaborators c
    where c.guide_id = v_row.guide_id
      and c.user_id = v_uid
      and c.status = 'accepted'
      and c.id <> v_row.id
  ) then
    update public.community_guide_collaborators
    set status = 'revoked',
        invite_token = null
    where id = v_row.id;

    raise exception 'You are already a collaborator on this guide';
  end if;

  update public.community_guide_collaborators
  set user_id = v_uid,
      display_name = v_name,
      status = 'accepted',
      accepted_at = now(),
      invite_token = null
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.get_community_guide_invite(p_token text)
returns table (
  id uuid,
  guide_id uuid,
  guide_title text,
  guide_slug text,
  author_name text,
  status text,
  invitee_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  if v_token is null then
    return;
  end if;

  return query
  select
    c.id,
    c.guide_id,
    g.title,
    g.slug,
    g.author_name,
    c.status,
    c.display_name
  from public.community_guide_collaborators c
  join public.community_guides g on g.id = c.guide_id
  where c.invite_token = v_token
    and c.status = 'pending';
end;
$$;

grant execute on function public.create_community_guide_invite(uuid, text) to authenticated;
grant execute on function public.accept_community_guide_invite(text) to authenticated;
grant execute on function public.get_community_guide_invite(text) to anon, authenticated;
