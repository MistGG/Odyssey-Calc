-- Verdandi SSS Legendary shop themes: 200 pts (IDs end in -legendary but cost more than Magia/Olympus legendary).
-- Keep: common 50, rare 75, other legendary 150.

create or replace function public.meter_wallet_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sum(points)::integer from public.meter_point_grants where user_id = p_user_id),
    0
  ) - coalesce(
    (select sum(
      case
        when theme_id in (
          'omegamon-legendary',
          'ulforce-veemon-x-legendary',
          'alphamon-ouryuken-legendary'
        ) then 200
        when theme_id like '%-legendary' then 150
        when theme_id like '%-rare' then 75
        else 50
      end
    )::integer
    from public.meter_theme_purchases
    where user_id = p_user_id),
    0
  );
$$;

create or replace function public.meter_purchase_theme(p_theme_id text, p_cost integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer;
  v_expected integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_theme_id is null or btrim(p_theme_id) = '' then
    raise exception 'Invalid theme';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'Invalid cost';
  end if;

  v_expected := case
    when p_theme_id in (
      'omegamon-legendary',
      'ulforce-veemon-x-legendary',
      'alphamon-ouryuken-legendary'
    ) then 200
    when p_theme_id like '%-legendary' then 150
    when p_theme_id like '%-rare' then 75
    else 50
  end;

  if p_cost <> v_expected then
    raise exception 'Invalid cost for theme';
  end if;

  if exists (
    select 1 from public.meter_theme_purchases
    where user_id = v_user_id and theme_id = p_theme_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_owned',
      'balance', public.meter_wallet_balance(v_user_id)
    );
  end if;

  v_balance := public.meter_wallet_balance(v_user_id);
  if v_balance < p_cost then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_points',
      'balance', v_balance
    );
  end if;

  insert into public.meter_theme_purchases (user_id, theme_id)
  values (v_user_id, p_theme_id);

  return jsonb_build_object(
    'ok', true,
    'balance', public.meter_wallet_balance(v_user_id)
  );
end;
$$;

grant execute on function public.meter_wallet_balance(uuid) to authenticated;
grant execute on function public.meter_purchase_theme(text, integer) to authenticated;
