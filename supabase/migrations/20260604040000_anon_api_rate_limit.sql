-- Rate-limit and gate anonymous PostgREST traffic.
-- Requires x-odyssey-client header (odyssey-calc | odyssey-companion) on all anon requests.
-- Write requests also count against a per-IP sliding window.

create schema if not exists private;

create table if not exists private.anon_rate_limits (
  ip inet not null,
  request_at timestamptz not null default now()
);

create index if not exists anon_rate_limits_ip_at_idx
  on private.anon_rate_limits (ip, request_at desc);

create or replace function public.check_request()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'anon');
  req_method text := coalesce(current_setting('request.method', true), 'GET');
  client_header text := coalesce(current_setting('request.headers', true)::json->>'x-odyssey-client', '');
  req_ip_text text := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  req_ip inet;
  recent_writes integer;
begin
  if jwt_role is distinct from 'anon' then
    return;
  end if;

  if client_header not in ('odyssey-calc', 'odyssey-companion') then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'message', 'Forbidden',
        'details', 'Missing or invalid x-odyssey-client header'
      )::text,
      detail = json_build_object('status', 403)::text;
  end if;

  if req_method in ('GET', 'HEAD') then
    return;
  end if;

  if req_ip_text = '' then
    return;
  end if;

  begin
    req_ip := req_ip_text::inet;
  exception
    when others then
      return;
  end;

  select count(*)::int
  into recent_writes
  from private.anon_rate_limits
  where ip = req_ip
    and request_at > now() - interval '1 minute';

  if recent_writes >= 120 then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'message', 'Rate limit exceeded',
        'details', 'Too many write requests from this client; retry shortly'
      )::text,
      detail = json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;

  insert into private.anon_rate_limits (ip, request_at)
  values (req_ip, now());
end;
$$;

alter role authenticator set pgrst.db_pre_request = 'public.check_request';

notify pgrst, 'reload config';
