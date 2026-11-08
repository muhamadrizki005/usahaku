begin;

create or replace function public.set_restaurant_table_availability(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,available boolean) returns jsonb
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
  if exists(select 1 from public.restaurant_reservations r where r.business_id=target_id and r.table_id=item_id and r.status='seated') then
   raise exception 'Reservation locks table' using errcode='PT409'; end if;
 end if;
 before_row:=to_jsonb(t);
 update public.restaurant_tables set occupied_until_released=not available,revision=revision+1 where business_id=target_id and id=item_id returning * into t;
 result:=to_jsonb(t);
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'table_availability',item_id,before_row,result);
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;

notify pgrst,'reload schema';
commit;
