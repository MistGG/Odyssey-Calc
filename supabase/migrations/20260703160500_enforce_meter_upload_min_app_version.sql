create or replace function public.enforce_meter_parse_min_app_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  version_parts text[];
  major_part int;
  minor_part int;
  patch_part int;
begin
  version_parts := regexp_match(trim(coalesce(new.app_version, '')), '^v?([0-9]+)\.([0-9]+)\.([0-9]+)');

  if version_parts is null then
    raise exception 'Please update Odyssey Companion to upload parses.' using errcode = 'P0001';
  end if;

  major_part := version_parts[1]::int;
  minor_part := version_parts[2]::int;
  patch_part := version_parts[3]::int;

  if (major_part, minor_part, patch_part) < (0, 1, 109) then
    raise exception 'Please update Odyssey Companion to upload parses.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_meter_parse_min_app_version_on_insert on public.meter_parses;

create trigger enforce_meter_parse_min_app_version_on_insert
before insert on public.meter_parses
for each row
execute function public.enforce_meter_parse_min_app_version();

comment on function public.enforce_meter_parse_min_app_version()
is 'Rejects meter uploads from Odyssey Companion versions older than 0.1.109.';
