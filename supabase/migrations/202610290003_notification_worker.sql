begin;
create or replace function public.admin_listings() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform app_private.require_user();
 if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(app_private.snapshot(v.id) || jsonb_build_object(
   'publishedVersion',app_private.snapshot(l.published_version_id,true),'reviewStatus',v.status,
   'contributorEmail',(select email from auth.users where id=l.owner_id),
   'contributorPhone',(select phone from public.profiles where id=l.owner_id)
 ) order by v.submitted_at nulls last),'[]'::jsonb)
 from public.listings l cross join lateral (select id,status,submitted_at from public.listing_versions where listing_id=l.id order by version_number desc limit 1) v);
end $$;
revoke all on function public.admin_listings() from public,anon;
grant execute on function public.admin_listings() to authenticated;
-- The worker can claim notification leases without allowing browser clients
-- to read recipients, internal notes, or provider diagnostics.
create function public.claim_notifications() returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  with candidates as (
    select id from public.notifications
    where recipient_user_id is not null and attempt_count < 5
    and ((status in ('pending','failed') and next_attempt_at <= now()) or (status='sending' and locked_at < now()-interval '10 minutes'))
    order by created_at for update skip locked limit 10
  ), claimed as (
    update public.notifications n set status='sending',attempt_count=attempt_count+1,locked_at=clock_timestamp(),updated_at=clock_timestamp()
    from candidates c where n.id=c.id returning n.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'attempt',n.attempt_count,'kind',n.kind,'email',u.email,'listingName',v.name,'feedback',e.public_feedback)),'[]'::jsonb)
  into result from claimed n join public.review_events e on e.id=n.review_event_id
  join public.listing_versions v on v.id=e.version_id join auth.users u on u.id=n.recipient_user_id;
  return result;
end $$;
create function public.finish_notification(p_id uuid,p_attempt integer,p_sent boolean,p_provider_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set status=case when p_sent then 'sent' else 'failed' end,
    provider_message_id=case when p_sent then p_provider_id else provider_message_id end,
    sent_at=case when p_sent then clock_timestamp() else null end,
    last_error=case when p_sent then null else 'Provider request failed; inspect worker configuration and retry.' end,
    next_attempt_at=now()+interval '5 minutes'*power(2,least(attempt_count,5)),locked_at=null,updated_at=clock_timestamp()
  where id=p_id and status='sending' and attempt_count=p_attempt;
  if not found then raise exception 'Notification lease expired or already completed.' using errcode='40001'; end if;
end $$;
revoke all on function public.claim_notifications(),public.finish_notification(uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_notifications(),public.finish_notification(uuid,integer,boolean,text) to service_role;

-- Preserve historic snapshots when a trusted operator deletes an Auth account.
create or replace function app_private.immutable_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.submitted_by is not null and new.submitted_by is null
    and not exists(select 1 from public.profiles where id=old.submitted_by)
    and (to_jsonb(new)-'submitted_by') = (to_jsonb(old)-'submitted_by') then return new; end if;
  if old.status <> 'draft' and (tg_op='DELETE' or (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at')) then
    raise exception 'Submitted snapshots cannot be edited.' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create or replace function app_private.append_only() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.actor_id is not null and new.actor_id is null
    and not exists(select 1 from public.profiles where id=old.actor_id)
    and (to_jsonb(new)-'actor_id') = (to_jsonb(old)-'actor_id') then return new; end if;
  raise exception 'Audit history is append-only.';
end $$;
revoke all on function app_private.immutable_version(),app_private.append_only() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
