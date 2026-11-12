-- Private, immutable cover objects. Apply after the security hardening migration.
begin;
do $$ begin
  if to_regprocedure('app_private.save_listing(jsonb,uuid,uuid,timestamp with time zone,boolean,text)') is null then
    raise exception 'Apply 202611070001_security_hardening.sql before the cover-photo migration.';
  end if;
end $$;
alter table public.listing_versions add column cover_photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-covers','listing-covers',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

-- Narrow helpers let Storage policies inspect private listing versions without
-- granting direct table access or exposing the app_private schema.
create function public.can_read_listing_cover(object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select (auth.uid() is not null and (
   split_part(object_path,'/',1)=auth.uid()::text or app_private.is_admin()
 )) or exists(
   select 1 from public.listings l join public.listing_versions v on v.id=l.published_version_id
   where l.visibility='published' and v.status='approved' and v.cover_photo_path=object_path
 )
$$;
create function public.can_upload_listing_cover(object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and object_path ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
$$;
revoke all on function public.can_read_listing_cover(text),public.can_upload_listing_cover(text) from public;
grant execute on function public.can_read_listing_cover(text) to anon,authenticated;
grant execute on function public.can_upload_listing_cover(text) to authenticated;

create policy listing_covers_read on storage.objects for select to anon,authenticated
using(bucket_id='listing-covers' and public.can_read_listing_cover(name));
create policy listing_covers_upload on storage.objects for insert to authenticated
with check(bucket_id='listing-covers' and public.can_upload_listing_cover(name));
-- No update/delete policies: replacing creates a fresh object, so submitted and
-- published snapshots cannot be changed by overwriting/removing the stored file.

create or replace function app_private.snapshot(p_version uuid, p_public boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'id',l.id,'versionId',v.id,'versionNumber',v.version_number,'coverPhotoPath',v.cover_photo_path,
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

create or replace function app_private.save_listing(p_payload jsonb, p_listing_id uuid default null, p_expected_version uuid default null,
  p_expected_updated_at timestamptz default null, p_submit boolean default false, p_legacy_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := app_private.require_user(); l public.listings; v public.listing_versions; d jsonb; loc jsonb; sched jsonb;
 locid uuid; photo_path text; i integer:=0; j integer; allowed text[];
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
 photo_path := v.cover_photo_path;
 if p_payload ? 'coverPhotoPath' then
   if jsonb_typeof(p_payload->'coverPhotoPath') not in ('string','null') then
     raise exception 'Cover photo path must be text.' using errcode='22023';
   end if;
   photo_path := nullif(p_payload->>'coverPhotoPath','');
 end if;
 if photo_path is not null then
   if length(photo_path)>200 or photo_path !~ ('^' || uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
     raise exception 'You do not own this cover photo.' using errcode='42501';
   end if;
   if not exists(select 1 from storage.objects where bucket_id='listing-covers' and name=photo_path) then
     raise exception 'Upload the cover photo before saving.' using errcode='22023';
   end if;
 end if;
 if v.id is null or v.status <> 'draft' then
   insert into public.listing_versions(listing_id,version_number) values(l.id,coalesce(v.version_number,0)+1) returning * into v;
 end if;
 update public.listing_versions set name=trim(coalesce(p_payload->>'name','')),address=trim(coalesce(p_payload->>'address','')),
 city=trim(coalesce(p_payload->>'city','')),state=trim(coalesce(p_payload->>'state','')),postal_code=trim(coalesce(p_payload->>'zip','')),
 map_location=trim(coalesce(p_payload->>'mapLocation','')),cover_photo_path=photo_path,updated_at=clock_timestamp() where id=v.id returning * into v;
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

revoke all on function app_private.save_listing(jsonb,uuid,uuid,timestamptz,boolean,text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
