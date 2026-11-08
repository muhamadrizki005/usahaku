begin;

alter table public.restaurant_tables add column occupied_until_released boolean not null default false;

create function public.hold_paid_restaurant_table() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='open' and new.status='paid' and new.kind='dine_in' and new.table_id is not null and new.occupies_table then
  update public.restaurant_tables set occupied_until_released=true,revision=revision+1
   where business_id=new.business_id and id=new.table_id and deleted_at is null;
 end if;
 return new;
end $$;
revoke all on function public.hold_paid_restaurant_table() from public,anon,authenticated;
create trigger hold_paid_restaurant_table after update of status on public.restaurant_orders
 for each row execute function public.hold_paid_restaurant_table();

create function public.set_restaurant_table_availability(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,available boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.restaurant_tables; prior public.restaurant_requests; payload jsonb; result jsonb; before_row jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 if item_id is null or expected_revision is null or operation_id is null or available is null then raise exception 'Invalid request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','table_availability','id',item_id,'revision',expected_revision,'available',available);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
  return prior.response;
 end if;
 select * into t from public.restaurant_tables where business_id=target_id and id=item_id for update;
 if not found or t.deleted_at is not null or t.revision<>expected_revision then raise exception 'Table changed; reload' using errcode='PT409'; end if;
 if available then
  if not t.active then raise exception 'Table disabled by manager' using errcode='PT409'; end if;
  if exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=item_id and o.status='open' and o.occupies_table) then
   raise exception 'Unpaid order locks table' using errcode='PT409'; end if;
  if exists(select 1 from public.restaurant_reservations r join public.businesses b on b.id=r.business_id
    where r.business_id=target_id and r.table_id=item_id and (r.status='seated' or
     (r.status='reserved' and r.starts_at-make_interval(mins=>b.reservation_lock_minutes)<=statement_timestamp() and r.ends_at>statement_timestamp()))) then
   raise exception 'Reservation locks table' using errcode='PT409'; end if;
 end if;
 before_row:=to_jsonb(t);
 update public.restaurant_tables set occupied_until_released=not available,revision=revision+1 where business_id=target_id and id=item_id returning * into t;
 result:=to_jsonb(t);
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'table_availability',item_id,before_row,result);
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.set_restaurant_table_availability(uuid,uuid,integer,uuid,boolean) from public,anon;
grant execute on function public.set_restaurant_table_availability(uuid,uuid,integer,uuid,boolean) to authenticated;

create or replace function public.restaurant_table_usage(target_id uuid) returns table(id uuid,occupied boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 return query select t.id,t.occupied_until_released
  or exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open' and o.occupies_table)
  or exists(select 1 from public.restaurant_reservations r where r.business_id=target_id and r.table_id=t.id and r.status='seated')
 from public.restaurant_tables t where t.business_id=target_id and t.active and t.deleted_at is null;
end $$;

create function pg_temp.patch_manual_table_release(signature regprocedure,needle text,replacement text) returns void language plpgsql as $$
declare body text:=pg_get_functiondef(signature);
begin
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unexpected function body: %, inspect before applying',signature; end if;
 execute replace(body,needle,replacement);
end $$;

select pg_temp.patch_manual_table_release('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 $n$if physical and exists(select 1 from public.restaurant_orders$n$,
 $r$if physical and t.occupied_until_released and (o.table_id is distinct from t.id or not coalesce(o.occupies_table,false)) then
      raise exception 'Table awaits manual release' using errcode='PT409'; end if;
    if physical and exists(select 1 from public.restaurant_orders$r$);

select pg_temp.patch_manual_table_release('public.restaurant_reservation_availability_before_hours(uuid,timestamptz,timestamptz,integer,uuid)',
 $n$and not (from_ts-make_interval(mins=>buffer)<now()+interval '90 minutes' and ($n$,
 $r$and not (from_ts-make_interval(mins=>buffer)<now()+interval '90 minutes' and (t.occupied_until_released or $r$);

select pg_temp.patch_manual_table_release('public.save_restaurant_reservation_before_hours(uuid,uuid,integer,uuid,jsonb)',
 $n$if slot_changed and from_ts-make_interval(mins=>buffer)<now()+interval '90 minutes' and ($n$,
 $r$if slot_changed and from_ts-make_interval(mins=>buffer)<now()+interval '90 minutes' and (t.occupied_until_released or $r$);

select pg_temp.patch_manual_table_release('public.arrive_restaurant_reservation(uuid,uuid,integer,uuid)',
 $n$if exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=r.table_id$n$,
 $r$if exists(select 1 from public.restaurant_tables where business_id=target_id and id=r.table_id and occupied_until_released) then
  raise exception 'Table awaits manual release' using errcode='PT409'; end if;
 if exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=r.table_id$r$);

create function public.protect_held_restaurant_table() returns trigger language plpgsql set search_path='' as $$
begin
 if old.occupied_until_released and (not new.active or new.deleted_at is not null) then
  raise exception 'Table awaits manual release' using errcode='PT409'; end if;
 return new;
end $$;
revoke all on function public.protect_held_restaurant_table() from public,anon,authenticated;
create trigger protect_held_restaurant_table before update on public.restaurant_tables for each row execute function public.protect_held_restaurant_table();

notify pgrst,'reload schema';
commit;
