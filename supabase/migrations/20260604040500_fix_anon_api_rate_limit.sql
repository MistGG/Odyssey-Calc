-- Fix check_request: skip write-rate-limit for RPC POSTs; correct PGRST error JSON.

create or replace function public.check_request()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'anon');
  req_method text := coalesce(current_setting('request.method', true), 'GET');
  req_path text := coalesce(current_setting('request.path', true), '');
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
        'code', '403',
        'message', 'Forbidden',
        'details', 'Missing or invalid x-odyssey-client header',
        'hint', 'Use an official Odyssey client'
      )::text,
      detail = json_build_object('status', 403)::text;
  end if;

  if req_method in ('GET', 'HEAD') or req_path like 'rpc/%' then
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
        'code', '429',
        'message', 'Rate limit exceeded',
        'details', 'Too many write requests from this client; retry shortly',
        'hint', 'Wait a minute and try again'
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

notify pgrst, 'reload config';
