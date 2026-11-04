begin;

create function public.create_restaurant_reservation_bundle(target_id uuid,item_id uuid,operation_id uuid,details jsonb,meal jsonb default null,deposit jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; o jsonb; prior public.restaurant_requests; payload jsonb; result jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not found or not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','reservation_bundle','id',item_id,'details',details,'meal',meal,'deposit',deposit);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  select * into r from public.restaurant_reservations where id=item_id and business_id=target_id;
  if not found or not(r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
  return to_jsonb(r);
 end if;
 if exists(select 1 from public.restaurant_reservations where id=item_id) then raise exception 'Reservation changed; reload' using errcode='PT409'; end if;
 if meal is not null and (jsonb_typeof(meal)<>'object' or meal-array['lines','notes']<>'{}'::jsonb
  or jsonb_typeof(meal->'lines') is distinct from 'array' or jsonb_typeof(meal->'notes') is distinct from 'string') then raise exception 'Invalid meal details' using errcode='22023'; end if;
 if deposit is not null and (jsonb_typeof(deposit)<>'object' or deposit-array['amount','payment','confirmed']<>'{}'::jsonb
  or coalesce(deposit->>'amount','') !~ '^[1-9][0-9]{0,11}$' or deposit->'confirmed' is distinct from 'true'::jsonb) then raise exception 'Invalid deposit confirmation' using errcode='22023'; end if;
 result:=public.save_restaurant_reservation(target_id,item_id,null,gen_random_uuid(),details);
 if meal is not null then
  o:=public.save_restaurant_order(target_id,gen_random_uuid(),null,gen_random_uuid(),jsonb_build_object(
   'kind','dine_in','tableId',result->>'table_id','guests',(result->>'guests')::integer,'customer',result->>'customer',
   'notes',meal->>'notes','stage','new','lines',meal->'lines','reservationId',item_id));
 end if;
 if deposit is not null then
  if o is not null and (deposit->>'amount')::numeric>(o->>'subtotal')::numeric then raise exception 'DP tidak boleh melebihi subtotal pesanan. Kurangi nominal DP atau periksa menu.' using errcode='P0001'; end if;
  result:=public.record_restaurant_deposit(target_id,item_id,(result->>'revision')::integer,gen_random_uuid(),(deposit->>'amount')::numeric,deposit->>'payment',(deposit->>'confirmed')::boolean);
 end if;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.create_restaurant_reservation_bundle(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_restaurant_reservation_bundle(uuid,uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
