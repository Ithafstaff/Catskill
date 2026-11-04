-- Apply once to a new Supabase project. All moderation writes go through RPCs.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', phone text not null default '',
  role text not null default 'contributor' check (role in ('contributor','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('Mikvah','Shul')),
  owner_id uuid references public.profiles(id) on delete set null,
  published_version_id uuid,
  visibility text not null default 'unpublished' check (visibility in ('unpublished','published','archived')),
  legacy_owner_id uuid, legacy_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (visibility <> 'published' or published_version_id is not null),
  unique (legacy_owner_id, legacy_id)
);
create table public.listing_versions (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings(id),
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft','pending_review','approved','changes_requested','rejected')),
  name text not null default '', address text not null default '', city text not null default '',
  state text not null default '', postal_code text not null default '', map_location text not null default '',
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz, accuracy_confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (listing_id, version_number), unique (listing_id, id)
);
alter table public.listings add constraint approved_version_same_listing
  foreign key (id, published_version_id) references public.listing_versions(listing_id,id) deferrable initially deferred;
create unique index one_active_version on public.listing_versions(listing_id) where status in ('draft','pending_review');
create index review_queue on public.listing_versions(status,submitted_at);
create index owned_listings on public.listings(owner_id);
create index public_listings on public.listings(visibility);

-- Detail maps preserve descriptive form values. Keys are validated/allowlisted
-- at the RPC boundary; public responses are separately projected below.
create table public.mikvah_details (
  version_id uuid primary key references public.listing_versions(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  contact_publication_confirmed_at timestamptz
);
create table public.shul_details (
  version_id uuid primary key references public.listing_versions(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object')
);
create table public.shul_locations (
  id uuid primary key default gen_random_uuid(), version_id uuid not null references public.listing_versions(id) on delete cascade,
  client_id text not null, is_primary boolean not null default false,
  name text not null default '', location_type text not null default '', address text not null default '',
  sort_order integer not null default 0, unique(version_id,client_id)
);
create unique index one_primary_location on public.shul_locations(version_id) where is_primary;
create index locations_parent on public.shul_locations(version_id);
create table public.minyan_schedules (
  id uuid primary key default gen_random_uuid(), location_id uuid not null references public.shul_locations(id) on delete cascade,
  client_id text not null, details jsonb not null check (jsonb_typeof(details) = 'object'),
  sort_order integer not null default 0, unique(location_id,client_id)
);
create index schedules_parent on public.minyan_schedules(location_id);
create table public.review_events (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings(id),
  version_id uuid, actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('submitted','approved','changes_requested','rejected','archived','restored','imported')),
  public_feedback text not null default '', internal_note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (listing_id,version_id) references public.listing_versions(listing_id,id),
  check (action not in ('changes_requested','rejected') or length(trim(public_feedback)) > 0)
);
create index history_parent on public.review_events(listing_id,created_at);
create table public.listing_sources (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings(id),
  source_key text not null, external_id text not null, label text not null, url text not null,
  imported_at timestamptz not null default now(), unique(source_key,external_id)
);
create index sources_parent on public.listing_sources(listing_id);
create table public.listing_media (
  id uuid primary key default gen_random_uuid(), version_id uuid not null references public.listing_versions(id),
  url text not null, source_url text, author text, year text, sort_order integer not null default 0
);
create index media_parent on public.listing_media(version_id);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), review_event_id uuid not null references public.review_events(id),
  recipient_user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('approval','changes_requested','rejection')),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempt_count integer not null default 0, next_attempt_at timestamptz default now(), sent_at timestamptz,
  locked_at timestamptz, provider_message_id text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(review_event_id,recipient_user_id,kind)
);
create index notification_queue on public.notifications(status,next_attempt_at);
create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create function app_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
create function app_private.require_user() returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Please sign in with a verified email address.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;
create function app_private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,phone) values
    (new.id,left(coalesce(new.raw_user_meta_data->>'name',''),200),left(coalesce(new.raw_user_meta_data->>'phone',''),60));
  return new;
end $$;
create trigger create_application_profile after insert on auth.users for each row execute function app_private.create_profile();
insert into public.profiles(id,display_name,phone)
 select id,left(coalesce(raw_user_meta_data->>'name',''),200),left(coalesce(raw_user_meta_data->>'phone',''),60) from auth.users
 on conflict(id) do nothing;

-- Lock content after submission, including all child records. Review status may
-- change only through privileged operations; authenticated roles have no DML grants.
create function app_private.immutable_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (tg_op = 'DELETE' or (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at')) then
    raise exception 'Submitted snapshots cannot be edited.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger immutable_snapshot before update or delete on public.listing_versions for each row execute function app_private.immutable_version();
create function app_private.immutable_child() returns trigger language plpgsql set search_path = '' as $$
declare vid uuid; oldvid uuid;
begin
  if tg_table_name = 'minyan_schedules' then
    if tg_op <> 'DELETE' then select version_id into vid from public.shul_locations where id = new.location_id; end if;
    if tg_op <> 'INSERT' then select version_id into oldvid from public.shul_locations where id = old.location_id; end if;
  else
    if tg_op <> 'DELETE' then vid := new.version_id; end if;
    if tg_op <> 'INSERT' then oldvid := old.version_id; end if;
  end if;
  if exists(select 1 from public.listing_versions where id in (vid,oldvid) and status <> 'draft') then
    raise exception 'Submitted detail records cannot be edited.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['mikvah_details','shul_details','shul_locations','minyan_schedules','listing_media'] loop
    execute format('create trigger immutable_detail before insert or update or delete on public.%I for each row execute function app_private.immutable_child()',t);
  end loop;
end $$;
create function app_private.append_only() returns trigger language plpgsql as $$ begin raise exception 'Audit history is append-only.'; end $$;
create trigger immutable_history before update or delete on public.review_events for each row execute function app_private.append_only();
create function app_private.valid_publication() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.published_version_id is not null and not exists(select 1 from public.listing_versions where id = new.published_version_id and listing_id = new.id and status = 'approved') then
    raise exception 'Published version must be approved and belong to this listing.';
  end if;
  return new;
end $$;
create trigger approved_publication before insert or update on public.listings for each row execute function app_private.valid_publication();

create function app_private.schedule_valid(s jsonb) returns boolean language sql immutable set search_path = '' as $$
select coalesce(
  s->>'prayerType' in ('Shacharis','Mincha','Maariv','Kabbalas Shabbos','Musaf','Selichos','Other')
  and (s->>'prayerType' <> 'Other' or length(trim(s->>'customPrayerName')) > 0)
  and case s->>'scheduleType'
    when 'weekly' then jsonb_typeof(s->'daysOfWeek') = 'array' and jsonb_array_length(s->'daysOfWeek') > 0
      and not exists(select 1 from jsonb_array_elements(s->'daysOfWeek') d where d::text not in ('0','1','2','3','4','5'))
    when 'shabbos' then length(trim(s->>'shabbosPeriod')) > 0
    when 'yom-tov' then length(trim(s->>'occasion')) > 0
    when 'seasonal' then length(trim(s->>'seasonalPattern')) > 0
    else false end
  and case s->>'timeType'
    when 'fixed' then s->>'startTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    when 'variable' then length(trim(s->>'timeDescription')) > 0 else false end, false)
$$;

create function app_private.snapshot(p_version uuid, p_public boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'id',l.id,'versionId',v.id,'versionNumber',v.version_number,
  'ownerId',case when p_public then null else l.owner_id end,
  'ownerName',case when p_public then '' else coalesce(p.display_name,'Directory administrator') end,
  'type',l.type,'name',v.name,'address',v.address,'city',v.city,'state',v.state,'zip',v.postal_code,'mapLocation',v.map_location,
  'status',case when l.visibility='archived' and not p_public then 'Archived' else case v.status when 'draft' then 'Draft' when 'pending_review' then 'Pending Review' when 'approved' then 'Published' when 'changes_requested' then 'Changes Requested' else 'Rejected' end end,
  'visibility',l.visibility,'createdAt',l.created_at,'updatedAt',v.updated_at,'submittedAt',v.submitted_at,
  'reviewNotes',case when p_public then null else (select public_feedback from public.review_events where version_id=v.id and action in ('approved','changes_requested','rejected') order by created_at desc,id desc limit 1) end,
  'data',coalesce(m.details,s.details,'{}'::jsonb) || coalesce((select jsonb_build_object('sourceLabel',label,'sourceUrl',url) from public.listing_sources where listing_id=l.id order by imported_at limit 1),'{}'::jsonb)
    || case when p_public then '{}'::jsonb else jsonb_build_object('confirmed',case when v.accuracy_confirmed_at is not null then 'yes' else '' end,'permission',case when m.contact_publication_confirmed_at is not null then 'yes' else '' end) end,
  'primarySchedules',coalesce((select jsonb_agg(ms.details || jsonb_build_object('id',ms.client_id) order by ms.sort_order) from public.minyan_schedules ms join public.shul_locations sl on sl.id=ms.location_id where sl.version_id=v.id and sl.is_primary),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',sl.client_id,'name',sl.name,'type',sl.location_type,'address',sl.address,'schedules',coalesce((select jsonb_agg(ms.details || jsonb_build_object('id',ms.client_id) order by ms.sort_order) from public.minyan_schedules ms where ms.location_id=sl.id),'[]'::jsonb)) order by sl.sort_order) from public.shul_locations sl where sl.version_id=v.id and not sl.is_primary),'[]'::jsonb)
 ) from public.listing_versions v join public.listings l on l.id=v.listing_id left join public.profiles p on p.id=l.owner_id
 left join public.mikvah_details m on m.version_id=v.id left join public.shul_details s on s.version_id=v.id where v.id=p_version
$$;

create function public.directory_listings() returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(app_private.snapshot(published_version_id,true) order by created_at),'[]'::jsonb) from public.listings where visibility='published'
$$;
create function public.my_listings() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := app_private.require_user(); result jsonb;
begin
 select coalesce(jsonb_agg(app_private.snapshot(v.id) order by v.updated_at desc),'[]'::jsonb) into result
 from public.listings l cross join lateral (select id,updated_at from public.listing_versions where listing_id=l.id order by version_number desc limit 1) v
 where l.owner_id=uid;
 return result;
end $$;
create function public.admin_listings() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform app_private.require_user();
 if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(app_private.snapshot(v.id) || jsonb_build_object('publishedVersion',app_private.snapshot(l.published_version_id,true)) order by v.submitted_at nulls last),'[]'::jsonb)
 from public.listings l cross join lateral (select id,submitted_at from public.listing_versions where listing_id=l.id order by version_number desc limit 1) v);
end $$;

create function public.save_listing(p_payload jsonb, p_listing_id uuid default null, p_expected_version uuid default null,
  p_expected_updated_at timestamptz default null, p_submit boolean default false, p_legacy_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := app_private.require_user(); l public.listings; v public.listing_versions; d jsonb; loc jsonb; sched jsonb;
 locid uuid; i integer:=0; j integer; allowed text[];
begin
 if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>200000 then raise exception 'Invalid or oversized listing.'; end if;
 if p_listing_id is null then
   if p_legacy_id is not null then
     select * into l from public.listings where legacy_owner_id=uid and legacy_id=p_legacy_id;
     if found then return app_private.snapshot((select id from public.listing_versions where listing_id=l.id order by version_number desc limit 1)); end if;
   end if;
   insert into public.listings(type,owner_id,legacy_owner_id,legacy_id) values(p_payload->>'type',uid,case when p_legacy_id is not null then uid end,p_legacy_id) returning * into l;
 else
   select * into l from public.listings where id=p_listing_id for update;
   if not found or l.owner_id is distinct from uid then raise exception 'You do not own this listing.' using errcode='42501'; end if;
   if l.visibility='archived' then raise exception 'Archived listings cannot be edited.'; end if;
   if p_payload->>'type' is distinct from l.type then raise exception 'Listing type cannot be changed.'; end if;
 end if;
 select * into v from public.listing_versions where listing_id=l.id order by version_number desc limit 1;
 if found then
   if v.id is distinct from p_expected_version or v.updated_at is distinct from p_expected_updated_at then raise exception 'This listing changed. Refresh before saving.' using errcode='40001'; end if;
   if v.status='pending_review' then raise exception 'This submission is awaiting review. Wait for a decision before editing.'; end if;
 end if;
 if v.id is null or v.status <> 'draft' then
   insert into public.listing_versions(listing_id,version_number) values(l.id,coalesce(v.version_number,0)+1) returning * into v;
 end if;
 update public.listing_versions set name=trim(coalesce(p_payload->>'name','')),address=trim(coalesce(p_payload->>'address','')),
 city=trim(coalesce(p_payload->>'city','')),state=trim(coalesce(p_payload->>'state','')),postal_code=trim(coalesce(p_payload->>'zip','')),
 map_location=trim(coalesce(p_payload->>'mapLocation','')),updated_at=clock_timestamp() where id=v.id returning * into v;
 d:=coalesce(p_payload->'data','{}'::jsonb);
 if jsonb_typeof(d)<>'object' or exists(select 1 from jsonb_each(d) where jsonb_typeof(value)<>'string') then raise exception 'Detail fields must be text.'; end if;
 allowed:=case l.type when 'Mikvah' then array['contactPerson','contactPhone','rav','ravPhone','appointmentRequired','appointmentPhone','season','summerFrom','summerTo','summerNote','winterFrom','winterTo','winterNote','fridayHours','motzeiHours','additionalInfo'] else array['gabbaiName','gabbaiPhone','specialDirections'] end;
 if l.type='Mikvah' then
   insert into public.mikvah_details(version_id,details,contact_publication_confirmed_at)
   values(v.id,(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(d) where key=any(allowed)),case when coalesce(d->>'permission','') in ('yes','true') then now() end)
   on conflict(version_id) do update set details=excluded.details,contact_publication_confirmed_at=excluded.contact_publication_confirmed_at;
 else
   insert into public.shul_details(version_id,details) values(v.id,(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(d) where key=any(allowed)))
   on conflict(version_id) do update set details=excluded.details;
   delete from public.shul_locations where version_id=v.id;
   for loc in select value from jsonb_array_elements(jsonb_build_array(jsonb_build_object('id','primary','name',v.name,'address',v.address,'schedules',coalesce(p_payload->'primarySchedules','[]'::jsonb))) || coalesce(p_payload->'locations','[]'::jsonb)) loop
     insert into public.shul_locations(version_id,client_id,is_primary,name,location_type,address,sort_order)
     values(v.id,coalesce(nullif(loc->>'id',''),gen_random_uuid()::text),i=0,coalesce(loc->>'name',''),coalesce(loc->>'type',''),coalesce(loc->>'address',''),i) returning id into locid;
     if p_submit and i>0 and (length(trim(coalesce(loc->>'name','')))=0 or length(trim(coalesce(loc->>'address','')))=0) then raise exception 'Additional locations require a name and address.'; end if;
     j:=0;
     for sched in select value from jsonb_array_elements(coalesce(loc->'schedules','[]'::jsonb)) loop
       if p_submit and not app_private.schedule_valid(sched) then raise exception 'Complete all prayer schedule fields before submitting.'; end if;
       insert into public.minyan_schedules(location_id,client_id,details,sort_order) values(locid,coalesce(nullif(sched->>'id',''),gen_random_uuid()::text),
        (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(sched) where key=any(array['prayerType','customPrayerName','scheduleType','daysOfWeek','shabbosPeriod','occasion','seasonalPattern','timeType','startTime','timeDescription','notes'])),j);
       j:=j+1;
     end loop;
     i:=i+1;
   end loop;
 end if;
 if p_submit then
   if v.name='' or v.address='' or v.city='' or v.state='' or v.postal_code='' then raise exception 'Name and complete address are required.'; end if;
   if coalesce(d->>'confirmed','') not in ('yes','true') then raise exception 'Confirm accuracy and authorization before submitting.'; end if;
   if l.type='Mikvah' and coalesce(d->>'permission','') not in ('yes','true') then raise exception 'Confirm permission to publish contact details.'; end if;
   if l.type='Mikvah' and (coalesce(d->>'appointmentRequired','') not in ('Yes','No','Confirm before visiting','Unknown') or (d->>'appointmentRequired'='Yes' and length(trim(coalesce(d->>'appointmentPhone','')))=0)) then raise exception 'Provide appointment guidance and the required appointment phone.'; end if;
   update public.listing_versions set status='pending_review',submitted_by=uid,submitted_at=clock_timestamp(),accuracy_confirmed_at=now(),updated_at=clock_timestamp() where id=v.id;
   insert into public.review_events(listing_id,version_id,actor_id,action) values(l.id,v.id,uid,'submitted');
 end if;
 update public.listings set updated_at=clock_timestamp() where id=l.id;
 return app_private.snapshot(v.id);
end $$;

create function public.review_listing(p_version_id uuid,p_decision text,p_feedback text default '',p_internal_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=app_private.require_user(); v public.listing_versions; l public.listings; eid uuid;
begin
 if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 select * into v from public.listing_versions where id=p_version_id;
 if not found then raise exception 'Submission not found.'; end if;
 select * into l from public.listings where id=v.listing_id for update;
 select * into v from public.listing_versions where id=p_version_id for update;
 if v.status <> 'pending_review' then raise exception 'Another reviewer already decided this submission. Refresh the queue.' using errcode='40001'; end if;
 if p_decision not in ('approved','changes_requested','rejected') then raise exception 'Invalid review decision.'; end if;
 if p_decision in ('changes_requested','rejected') and length(trim(coalesce(p_feedback,'')))=0 then raise exception 'Contributor feedback is required.'; end if;
 update public.listing_versions set status=p_decision,updated_at=clock_timestamp() where id=v.id;
 if p_decision='approved' then
   update public.listings set published_version_id=v.id,visibility=case when visibility='archived' then 'archived' else 'published' end,updated_at=clock_timestamp() where id=l.id;
 end if;
 insert into public.review_events(listing_id,version_id,actor_id,action,public_feedback,internal_note)
 values(l.id,v.id,uid,p_decision,trim(coalesce(p_feedback,'')),coalesce(p_internal_note,'')) returning id into eid;
 if l.owner_id is not null then
   insert into public.notifications(review_event_id,recipient_user_id,kind) values(eid,l.owner_id,case p_decision when 'approved' then 'approval' when 'rejected' then 'rejection' else p_decision end);
 end if;
end $$;
create function public.set_listing_archived(p_listing_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=app_private.require_user(); l public.listings;
begin
 if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id for update;
 if not found then raise exception 'Listing not found.'; end if;
 if not p_archived and l.published_version_id is null then raise exception 'Only a previously approved listing can be restored.'; end if;
 if (p_archived and l.visibility='archived') or (not p_archived and l.visibility<>'archived') then raise exception 'Listing visibility changed. Refresh and try again.' using errcode='40001'; end if;
 update public.listings set visibility=case when p_archived then 'archived' else 'published' end,updated_at=clock_timestamp() where id=l.id;
 insert into public.review_events(listing_id,actor_id,action) values(l.id,uid,case when p_archived then 'archived' else 'restored' end);
end $$;
create function public.listing_history(p_listing_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=app_private.require_user(); adm boolean:=app_private.is_admin();
begin
 if not exists(select 1 from public.listings where id=p_listing_id and (owner_id=uid or adm)) then raise exception 'Access denied.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg((jsonb_build_object('id',e.id,'action',e.action,'feedback',e.public_feedback,'createdAt',e.created_at,'versionId',e.version_id)) || case when adm then jsonb_build_object('internalNote',e.internal_note,'actor',coalesce(p.display_name,'System')) else '{}'::jsonb end order by e.created_at desc),'[]'::jsonb)
 from public.review_events e left join public.profiles p on p.id=e.actor_id where e.listing_id=p_listing_id);
end $$;
create function public.delete_draft(p_listing_id uuid,p_expected_version uuid) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=app_private.require_user(); l public.listings;
begin
 select * into l from public.listings where id=p_listing_id for update;
 if not found or l.owner_id is distinct from uid then raise exception 'Access denied.' using errcode='42501'; end if;
 if not exists(select 1 from public.listing_versions where id=p_expected_version and listing_id=l.id and status='draft') then raise exception 'Only a current draft can be deleted.'; end if;
 delete from public.listing_versions where id=p_expected_version;
 if not exists(select 1 from public.listing_versions where listing_id=l.id) then delete from public.listings where id=l.id; end if;
end $$;
create function public.request_account_deletion() returns void language plpgsql security definer set search_path = '' as $$
begin insert into public.account_deletion_requests(user_id) values(app_private.require_user()) on conflict do nothing; end $$;

-- Defense in depth: RLS plus explicit grants. No browser role can write core
-- tables directly, read auth emails, internal notes, or notification payloads.
do $$ declare t text; begin
 foreach t in array array['profiles','listings','listing_versions','mikvah_details','shul_details','shul_locations','minyan_schedules','review_events','listing_sources','listing_media','notifications','account_deletion_requests'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy edit_own_profile on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant select on public.profiles to authenticated;
grant update(display_name,phone) on public.profiles to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.directory_listings(),public.my_listings(),public.admin_listings(),public.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text),public.review_listing(uuid,text,text,text),public.set_listing_archived(uuid,boolean),public.listing_history(uuid),public.delete_draft(uuid,uuid),public.request_account_deletion() from public,anon,authenticated;
grant execute on function public.directory_listings() to anon,authenticated;
grant execute on function public.my_listings(),public.admin_listings(),public.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text),public.review_listing(uuid,text,text,text),public.set_listing_archived(uuid,boolean),public.listing_history(uuid),public.delete_draft(uuid,uuid),public.request_account_deletion() to authenticated;
-- Workers use a server credential; ordinary app users cannot access the outbox.
grant usage on schema public to anon,authenticated,service_role;
grant select,update on public.notifications to service_role;
grant select on public.review_events,public.profiles,public.listings,public.listing_versions to service_role;
notify pgrst,'reload schema';
commit;
