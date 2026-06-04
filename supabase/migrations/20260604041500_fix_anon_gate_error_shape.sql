-- Fix PGRST error detail shape (requires status + headers keys).

create or replace function public.check_request()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'anon');
  client_header text := coalesce(current_setting('request.headers', true)::json->>'x-odyssey-client', '');
begin
  if jwt_role is distinct from 'anon' then
    return;
  end if;

  if client_header not in ('odyssey-calc', 'odyssey-companion') then
    raise sqlstate 'PGRST' using
      message = '{"message":"Forbidden","details":"Missing or invalid x-odyssey-client header","hint":"Use an official Odyssey client","code":"403"}',
      detail = '{"status":403,"headers":{},"status_text":"Forbidden"}';
  end if;
end;
$$;

notify pgrst, 'reload config';
