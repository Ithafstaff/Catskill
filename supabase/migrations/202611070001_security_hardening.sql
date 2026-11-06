-- Additive hardening: retain the original ownership, snapshot and review logic.
begin;

create function app_private.validate_text_fields(value jsonb, fields text[], max_length integer)
returns void language plpgsql immutable set search_path = '' as $$
declare field text;
begin
  if jsonb_typeof(value) is distinct from 'object' then
    raise exception 'Expected an object.' using errcode = '22023';
  end if;
  foreach field in array fields loop
    if value ? field and (jsonb_typeof(value->field) <> 'string' or length(value->>field) > max_length) then
      raise exception 'Text fields have an invalid type or exceed the length limit.' using errcode = '22023';
    end if;
  end loop;
end $$;

create function app_private.validate_schedules(schedules jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare schedule jsonb;
begin
  if jsonb_typeof(schedules) is distinct from 'array' then
    raise exception 'Schedules must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(schedules) > 100 then
    raise exception 'A location may have at most 100 schedules.' using errcode = '22023';
  end if;
  for schedule in select value from jsonb_array_elements(schedules) loop
    perform app_private.validate_text_fields(schedule, array[
      'id','prayerType','customPrayerName','scheduleType','shabbosPeriod','occasion',
      'seasonalPattern','timeType','startTime','timeDescription','notes'
    ], 4000);
    if schedule ? 'daysOfWeek' then
      if jsonb_typeof(schedule->'daysOfWeek') <> 'array' then
        raise exception 'Schedule days must be an array.' using errcode = '22023';
      end if;
      if jsonb_array_length(schedule->'daysOfWeek') > 6 or exists(
        select 1 from jsonb_array_elements(schedule->'daysOfWeek') day
        where day::text not in ('0','1','2','3','4','5')
      ) then
        raise exception 'Schedule days must be weekdays from 0 through 5.' using errcode = '22023';
      end if;
    end if;
  end loop;
end $$;

-- One row per account, with an atomic update shared by all API instances.
-- Fail safely rather than declaring existing incompatible schedules repaired.
do $$ declare schedule jsonb; begin
  for schedule in select details from public.minyan_schedules loop
    perform app_private.validate_schedules(jsonb_build_array(schedule));
  end loop;
end $$;

create table app_private.listing_write_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  writes integer not null
);
revoke all on app_private.listing_write_limits from public, anon, authenticated;

-- Moving the original into the unexposed schema prevents bypassing validation.
alter function public.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text) set schema app_private;
revoke all on function app_private.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text) from public, anon, authenticated;

create function public.save_listing(
  p_payload jsonb, p_listing_id uuid default null, p_expected_version uuid default null,
  p_expected_updated_at timestamptz default null, p_submit boolean default false, p_legacy_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := app_private.require_user(); location jsonb; details jsonb; writes integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 200000 then
    raise exception 'Invalid or oversized listing.' using errcode = '22023';
  end if;
  if p_submit is null or length(p_legacy_id) > 200 then
    raise exception 'Invalid listing parameters.' using errcode = '22023';
  end if;
  perform app_private.validate_text_fields(p_payload, array['type','name','address','city','state','zip','mapLocation'], 1000);
  details := coalesce(p_payload->'data', '{}'::jsonb);
  if jsonb_typeof(details) <> 'object' then
    raise exception 'Detail fields must be text.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_each(details) where jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 10000) then
    raise exception 'Detail fields must be text of at most 10000 characters.' using errcode = '22023';
  end if;
  perform app_private.validate_schedules(coalesce(p_payload->'primarySchedules', '[]'::jsonb));
  if p_payload ? 'locations' then
    if jsonb_typeof(p_payload->'locations') <> 'array' then
      raise exception 'Locations must be an array.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_payload->'locations') > 25 then
      raise exception 'A listing may have at most 25 additional locations.' using errcode = '22023';
    end if;
    for location in select value from jsonb_array_elements(p_payload->'locations') loop
      perform app_private.validate_text_fields(location, array['id','name','type','address'], 1000);
      perform app_private.validate_schedules(coalesce(location->'schedules', '[]'::jsonb));
    end loop;
  end if;
  insert into app_private.listing_write_limits as limits values(uid, clock_timestamp(), 1)
  on conflict(user_id) do update set
    window_started_at = case when limits.window_started_at <= clock_timestamp() - interval '1 minute' then clock_timestamp() else limits.window_started_at end,
    writes = case when limits.window_started_at <= clock_timestamp() - interval '1 minute' then 1 else limits.writes + 1 end
  returning limits.writes into writes;
  if writes > 60 then
    raise sqlstate 'PT429' using message = 'Too many listing saves. Please wait a minute and retry.';
  end if;
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"}]', true);
  return app_private.save_listing(p_payload,p_listing_id,p_expected_version,p_expected_updated_at,p_submit,p_legacy_id);
end $$;

-- Bound direct profile writes as well as profile metadata copied during signup.
create function app_private.validate_profile() returns trigger language plpgsql set search_path = '' as $$
begin
  if length(new.display_name) > 200 or length(new.phone) > 60 then
    raise exception 'Profile name or phone exceeds the length limit.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger validate_profile before insert or update on public.profiles
for each row execute function app_private.validate_profile();

-- Private reads may also be called with GET through PostgREST. Set explicit
-- origin response headers; the browser also uses no-store for private requests.
create or replace function public.my_listings() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := app_private.require_user(); result jsonb;
begin
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"}]', true);
  select coalesce(jsonb_agg(app_private.snapshot(v.id) order by v.updated_at desc),'[]'::jsonb) into result
  from public.listings l cross join lateral (select id,updated_at from public.listing_versions where listing_id=l.id order by version_number desc limit 1) v
  where l.owner_id=uid;
  return result;
end $$;

create or replace function public.admin_listings() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"}]', true);
  return (select coalesce(jsonb_agg(app_private.snapshot(v.id) || jsonb_build_object(
    'publishedVersion',app_private.snapshot(l.published_version_id,true),'reviewStatus',v.status,
    'contributorEmail',(select email from auth.users where id=l.owner_id),
    'contributorPhone',(select phone from public.profiles where id=l.owner_id)
  ) order by v.submitted_at nulls last),'[]'::jsonb)
  from public.listings l cross join lateral (select id,status,submitted_at from public.listing_versions where listing_id=l.id order by version_number desc limit 1) v);
end $$;

create or replace function public.listing_history(p_listing_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=app_private.require_user(); adm boolean:=app_private.is_admin();
begin
  if not exists(select 1 from public.listings where id=p_listing_id and (owner_id=uid or adm)) then raise exception 'Access denied.' using errcode='42501'; end if;
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"}]', true);
  return (select coalesce(jsonb_agg((jsonb_build_object('id',e.id,'action',e.action,'feedback',e.public_feedback,'createdAt',e.created_at,'versionId',e.version_id)) || case when adm then jsonb_build_object('internalNote',e.internal_note,'actor',coalesce(p.display_name,'System')) else '{}'::jsonb end order by e.created_at desc),'[]'::jsonb)
  from public.review_events e left join public.profiles p on p.id=e.actor_id where e.listing_id=p_listing_id);
end $$;

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text) from public,anon;
grant execute on function public.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
