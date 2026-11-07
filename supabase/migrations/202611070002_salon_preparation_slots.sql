begin;

create function public.salon_slot_conflict(target_id uuid,practitioner_key uuid,from_ts timestamptz,to_ts timestamptz,exclude_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.salon_visits x where x.business_id=target_id and x.practitioner_id=practitioner_key and x.id<>exclude_id and (
  (x.status in ('scheduled','waiting','in_service') and x.starts_at<to_ts and x.busy_until>from_ts) or
  (x.status='finished' and x.buffer_minutes>0 and x.finished_at<to_ts and x.finished_at+x.buffer_minutes*interval '1 minute'>from_ts)));
$$;
revoke all on function public.salon_slot_conflict(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

do $patch$
declare body text; needle text:='exists(select 1 from public.salon_visits x where x.business_id=target_id and x.practitioner_id=p.id and x.id<>item_id and x.status in (''scheduled'',''waiting'',''in_service'') and x.starts_at<hold_until and x.busy_until>starts)';
begin
 body:=pg_get_functiondef('public.salon_visit_operation(uuid,uuid,integer,uuid,text,jsonb)'::regprocedure);
 if strpos(body,needle)=0 then raise exception 'Unexpected salon slot guard'; end if;
 body:=replace(body,needle,'public.salon_slot_conflict(target_id,p.id,starts,hold_until,item_id)');
 needle:='if action=''save'' then';
 if strpos(body,needle)=0 then raise exception 'Unexpected salon save guard'; end if;
 body:=replace(body,needle,needle||E'\n  if v.id is not null and details->>''kind'' is distinct from v.kind then raise exception ''Jenis kunjungan tidak dapat diubah setelah dibuat.'' using errcode=''P0001''; end if;');
 execute body;
end $patch$;

create or replace function public.salon_busy_slots(target_id uuid,from_ts timestamptz,to_ts timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if not public.has_salon_access(target_id) then raise exception 'Salon access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts-from_ts>interval '7 days' then raise exception 'Invalid salon availability filter' using errcode='22023'; end if;
 with slots as (
  select v.practitioner_id,v.status='in_service' as in_service,case when status='finished' then finished_at else starts_at end as starts_at,
   case when status='finished' then finished_at+buffer_minutes*interval '1 minute' else busy_until end as ends_at
  from public.salon_visits v where business_id=target_id and (status in ('scheduled','waiting','in_service') or (status='finished' and buffer_minutes>0))
 ), visible as (select * from slots where starts_at<to_ts and (ends_at>from_ts or in_service))
 select count(*),coalesce(jsonb_agg(jsonb_build_object('practitioner_id',practitioner_id,'starts_at',starts_at,'ends_at',ends_at,'in_service',in_service) order by starts_at),'[]') into total,result from visible;
 if total>5000 then raise exception 'Persempit rentang kalender.' using errcode='54000'; end if;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
