-- Fix invite token generation: gen_random_bytes is not always on search_path.

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
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_community_guide_invite(uuid, text) to authenticated;
