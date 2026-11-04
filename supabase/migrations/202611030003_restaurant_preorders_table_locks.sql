begin;

alter table public.businesses add column reservation_lock_minutes integer not null default 120 check(reservation_lock_minutes between 0 and 720);
alter table public.businesses add column reservation_settings_revision integer not null default 0 check(reservation_settings_revision>=0);
alter table public.restaurant_orders add column occupies_table boolean not null default true;
drop index public.restaurant_one_open_table;
create unique index restaurant_one_open_table on public.restaurant_orders(business_id,table_id) where status='open' and table_id is not null and occupies_table;

create function public.reservation_hold_available(target_id uuid,table_key uuid,from_ts timestamptz,to_ts timestamptz,exclude_id uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.restaurant_reservations r join public.businesses b on b.id=r.business_id
  where r.business_id=target_id and r.table_id=table_key and r.id is distinct from exclude_id and r.status in ('reserved','seated')
    and r.starts_at-make_interval(mins=>b.reservation_lock_minutes)<to_ts and r.ends_at>from_ts)
$$;
revoke all on function public.reservation_hold_available(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

create function public.save_restaurant_lock_settings(target_id uuid,expected_revision integer,operation_id uuid,minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.businesses; prior public.restaurant_requests; payload jsonb; result jsonb; conflicts bigint; old_minutes integer;
begin
 select * into b from public.businesses where id=target_id for update;
 if not found or not public.has_restaurant_access(target_id,array['owner']) then raise exception 'Owner access required' using errcode='42501'; end if;
 if operation_id is null or minutes is null or minutes not between 0 and 720 then raise exception 'Lock duration must be 0 to 720 minutes' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','reservation_lock_settings','revision',expected_revision,'minutes',minutes);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 if expected_revision is distinct from b.reservation_settings_revision then raise exception 'Settings changed; reload' using errcode='PT409'; end if;
 old_minutes:=b.reservation_lock_minutes;
 update public.businesses set reservation_lock_minutes=minutes,reservation_settings_revision=reservation_settings_revision+1 where id=target_id returning * into b;
 select count(*) into conflicts from public.restaurant_reservations r join public.restaurant_reservations q on q.business_id=r.business_id and q.table_id=r.table_id and q.id>r.id
  where r.business_id=target_id and r.status in ('reserved','seated') and q.status in ('reserved','seated') and r.ends_at>now() and q.ends_at>now()
    and r.starts_at-make_interval(mins=>minutes)<q.ends_at and q.starts_at-make_interval(mins=>minutes)<r.ends_at;
 result:=jsonb_build_object('minutes',minutes,'revision',b.reservation_settings_revision,'conflicts',conflicts);
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'reservation_lock_settings',target_id,jsonb_build_object('minutes',old_minutes,'revision',expected_revision),result);
 return result;
end $$;
revoke all on function public.save_restaurant_lock_settings(uuid,integer,uuid,integer) from public,anon;
grant execute on function public.save_restaurant_lock_settings(uuid,integer,uuid,integer) to authenticated;

create or replace function public.restaurant_reservation_availability(target_id uuid,from_ts timestamptz,to_ts timestamptz,guest_count integer,exclude_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; buffer integer;
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts>from_ts+interval '12 hours' or guest_count is null or guest_count not between 1 and 1000 then raise exception 'Invalid slot' using errcode='22023'; end if;
 if exclude_id is not null and not exists(select 1 from public.restaurant_reservations r where r.id=exclude_id and r.business_id=target_id and (r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin']))) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 select reservation_lock_minutes into buffer from public.businesses where id=target_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'capacity',t.capacity,'available',
  exists(select 1 from public.restaurant_reservations existing where existing.id=exclude_id and existing.business_id=target_id and existing.table_id=t.id and existing.status='reserved' and existing.starts_at=from_ts and existing.ends_at=to_ts)
  or (public.reservation_hold_available(target_id,t.id,from_ts-make_interval(mins=>buffer),to_ts,exclude_id)
  and not (from_ts-make_interval(mins=>buffer)<now()+interval '90 minutes' and (
   exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open' and o.occupies_table)
   or exists(select 1 from public.restaurant_reservations r where r.business_id=target_id and r.table_id=t.id and r.status='seated' and r.id is distinct from exclude_id))))) order by t.name,t.id),'[]'::jsonb)
 into items from public.restaurant_tables t where t.business_id=target_id and t.active and t.capacity>=guest_count;
 return items;
end $$;

create or replace function public.restaurant_table_usage(target_id uuid) returns table(id uuid,occupied boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 return query select t.id,exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open' and o.occupies_table)
  or exists(select 1 from public.restaurant_reservations r where r.business_id=target_id and r.table_id=t.id and r.status='seated')
 from public.restaurant_tables t where t.business_id=target_id and t.active;
end $$;

create function public.read_restaurant_table_state(target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; next_change timestamptz; buffer integer;
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 select reservation_lock_minutes into buffer from public.businesses where id=target_id;
 select min(v) into next_change from (
  select r.starts_at-make_interval(mins=>buffer) v from public.restaurant_reservations r where r.business_id=target_id and r.status='reserved'
  union all select r.ends_at from public.restaurant_reservations r where r.business_id=target_id and r.status='reserved'
 ) x where v>statement_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'occupied',u.occupied,'locked',h.n>0,'reserved',h.n>0,'conflict',(u.occupied and h.n>0) or h.n>1,'observed_at',statement_timestamp(),'next_change_at',next_change) order by t.id),'[]'::jsonb)
 into result from public.restaurant_tables t join public.restaurant_table_usage(target_id) u on u.id=t.id
 cross join lateral(select count(*) n from public.restaurant_reservations r where r.business_id=target_id and r.table_id=t.id and r.status='reserved'
   and r.starts_at-make_interval(mins=>buffer)<=statement_timestamp() and r.ends_at>statement_timestamp()) h
 where t.business_id=target_id and t.active;
 return result;
end $$;
revoke all on function public.read_restaurant_table_state(uuid) from public,anon;
grant execute on function public.read_restaurant_table_state(uuid) to authenticated;

create or replace function public.protect_occupied_restaurant_table() returns trigger
language plpgsql security definer set search_path='' as $$
declare required_guests integer;
begin
 select guests into required_guests from public.restaurant_orders where business_id=new.business_id and table_id=new.id and status='open' and occupies_table limit 1;
 if found then
  if not new.active then raise exception 'Table has an open order; keep it active and sufficient capacity' using errcode='PT409',detail='{"reason":"table_busy_deactivate"}'; end if;
  if required_guests>new.capacity then raise exception 'Table has an open order; keep it active and sufficient capacity' using errcode='PT409',detail=jsonb_build_object('reason','table_busy_capacity','capacity',new.capacity,'guests',required_guests)::text; end if;
 end if;
 return new;
end $$;
create or replace function public.save_restaurant_order_core_v2(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb,physical boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.restaurant_orders; old_row jsonb; t public.restaurant_tables; m public.restaurant_menu;
  actor public.business_members; prior public.restaurant_requests; payload jsonb; line jsonb; old_line jsonb;
  snapshot jsonb:='[]'; amount integer; price numeric; order_subtotal numeric:=0; result jsonb;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
  select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('resource','order','id',item_id,'revision',expected_revision,'details',details);
  select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
    return prior.response;
  end if;
  select * into o from public.restaurant_orders where id=item_id for update;
  if found then
    if o.business_id<>target_id or (actor.role='cashier' and o.actor_id is distinct from auth.uid()) then raise exception 'Order access denied' using errcode='42501'; end if;
    perform public.restaurant_require_open(o.status,o.revision,expected_revision);
    old_row:=to_jsonb(o);
  elsif expected_revision is not null then raise exception 'Order missing; reload' using errcode='PT409'; end if;
  if details is null or jsonb_typeof(details)<>'object'
    or details-array['kind','tableId','guests','customer','notes','stage','lines']<>'{}'::jsonb
    or coalesce(details->>'kind','') not in ('dine_in','takeaway')
    or coalesce(details->>'guests','') !~ '^[1-9][0-9]{0,3}$' or (details->>'guests')::integer>1000
    or jsonb_typeof(details->'customer') is distinct from 'string' or char_length(trim(details->>'customer')) not between 1 and 100
    or jsonb_typeof(details->'notes') is distinct from 'string' or char_length(details->>'notes')>300
    or coalesce(details->>'stage','') not in ('new','preparing','ready','served')
    or jsonb_typeof(details->'lines') is distinct from 'array' or jsonb_array_length(details->'lines') not between 1 and 100 then raise exception 'Invalid order' using errcode='22023'; end if;
  if (old_row is null and details->>'stage'<>'new') or (old_row is not null and array_position(array['new','preparing','ready','served'],details->>'stage')<array_position(array['new','preparing','ready','served'],o.stage)) then raise exception 'Invalid order stage' using errcode='22023'; end if;
  if details->>'kind'='dine_in' then
    select * into t from public.restaurant_tables where id=(details->>'tableId')::uuid and business_id=target_id for update;
    if not found then raise exception 'Table unavailable or insufficient capacity' using errcode='PT409',detail='{"reason":"table_missing"}'; end if;
    if not t.active then raise exception 'Table unavailable or insufficient capacity' using errcode='PT409',detail='{"reason":"table_inactive"}'; end if;
    if t.capacity<(details->>'guests')::integer then
      raise exception 'Table unavailable or insufficient capacity' using errcode='PT409',detail=jsonb_build_object('reason','table_capacity','capacity',t.capacity,'guests',(details->>'guests')::integer)::text;
    end if;
    if physical and exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=t.id and status='open' and occupies_table and id<>item_id) then raise exception 'Table already occupied' using errcode='PT409',detail='{"reason":"table_occupied"}'; end if;
  elsif details->'tableId' is distinct from 'null'::jsonb then raise exception 'Takeaway has no table' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(details->'lines'))<>jsonb_array_length(details->'lines') then raise exception 'Duplicate menu item' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(details->'lines') order by value->>'id' loop
    if jsonb_typeof(line)<>'object' or line-array['id','quantity']<>'{}'::jsonb or coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Invalid menu quantity' using errcode='22023'; end if;
    amount:=(line->>'quantity')::integer;
    select * into m from public.restaurant_menu where id=(line->>'id')::uuid and business_id=target_id for update;
    if not found then raise exception 'Menu unavailable' using errcode='PT409',detail='{"reason":"menu_missing"}'; end if;
    old_line:=null;
    if old_row is not null then select value into old_line from jsonb_array_elements(o.lines) where value->>'id'=line->>'id'; end if;
    if old_line is not null and amount<=(old_line->>'quantity')::integer then
      price:=(old_line->>'price')::numeric;
      snapshot:=snapshot||jsonb_build_array(old_line||jsonb_build_object('quantity',amount,'total',price*amount));
    else
      if not m.active then raise exception 'Menu unavailable' using errcode='PT409',detail='{"reason":"menu_inactive"}'; end if;
      if not m.available then raise exception 'Menu unavailable' using errcode='PT409',detail=jsonb_build_object('reason','menu_out','name',m.name)::text; end if;
      price:=m.price;
      snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',m.id,'name',m.name,'sku','','unit','porsi','price',price,'quantity',amount,'total',price*amount));
    end if;
    order_subtotal:=order_subtotal+price*amount;
    if order_subtotal>999999999999 then raise exception 'Total exceeds limit' using errcode='22023'; end if;
  end loop;
  if old_row is null then
    insert into public.restaurant_orders(id,business_id,actor_id,actor_name,kind,table_id,table_name,guests,customer,notes,lines,subtotal,occupies_table)
      values(item_id,target_id,auth.uid(),actor.name,details->>'kind',t.id,t.name,(details->>'guests')::integer,trim(details->>'customer'),trim(details->>'notes'),snapshot,order_subtotal,physical) returning * into o;
  else
    update public.restaurant_orders set kind=details->>'kind',table_id=t.id,table_name=t.name,guests=(details->>'guests')::integer,
      customer=trim(details->>'customer'),notes=trim(details->>'notes'),lines=snapshot,subtotal=order_subtotal,
      occupies_table=physical,stage=details->>'stage',revision=revision+1,updated_at=now() where id=item_id returning * into o;
  end if;
  result:=to_jsonb(o);
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'order',item_id,old_row,result);
  insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
  return result;
end $$;


revoke all on function public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean) from public,anon,authenticated;

create or replace function public.save_restaurant_reservation(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; t public.restaurant_tables; actor public.business_members; prior public.restaurant_requests; payload jsonb; old_row jsonb; from_ts timestamptz; to_ts timestamptz; buffer integer; slot_changed boolean;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
 if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','reservation','id',item_id,'revision',expected_revision,'details',details);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 select * into r from public.restaurant_reservations where id=item_id for update;
 if found then
  if r.business_id<>target_id or (actor.role='cashier' and r.actor_id is distinct from auth.uid()) then raise exception 'Reservation access denied' using errcode='42501'; end if;
  if r.status<>'reserved' or expected_revision is distinct from r.revision then raise exception 'Reservation changed; reload' using errcode='PT409'; end if;
  old_row:=to_jsonb(r);
 elsif expected_revision is not null then raise exception 'Reservation missing' using errcode='PT409'; end if;
 if details is null or jsonb_typeof(details)<>'object' or details-array['tableId','guests','customer','phone','notes','startsAt','endsAt']<>'{}'::jsonb
  or coalesce(details->>'guests','') !~ '^[1-9][0-9]{0,3}$' or (details->>'guests')::integer>1000
  or jsonb_typeof(details->'customer') is distinct from 'string' or char_length(trim(details->>'customer')) not between 1 and 100
  or jsonb_typeof(details->'phone') is distinct from 'string' or coalesce(details->>'phone','') !~ '^\+?[0-9 ()-]{8,30}$'
  or jsonb_typeof(details->'notes') is distinct from 'string' or char_length(details->>'notes')>300 then raise exception 'Invalid reservation' using errcode='22023'; end if;
 from_ts:=(details->>'startsAt')::timestamptz; to_ts:=(details->>'endsAt')::timestamptz;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or from_ts<now() or from_ts>now()+interval '366 days' or to_ts<=from_ts or to_ts>from_ts+interval '12 hours' then raise exception 'Choose a future slot within 366 days, duration up to 12 hours' using errcode='22023'; end if;
 select * into t from public.restaurant_tables where business_id=target_id and id=(details->>'tableId')::uuid and active for update;
 if not found then raise exception 'Meja tidak aktif atau tidak ditemukan.' using errcode='P0001'; end if;
 if t.capacity<(details->>'guests')::integer then raise exception 'Kapasitas meja tidak cukup untuk jumlah tamu.' using errcode='P0001'; end if;
 select reservation_lock_minutes into buffer from public.businesses where id=target_id;
 slot_changed:=old_row is null or r.table_id is distinct from t.id or r.starts_at is distinct from from_ts or r.ends_at is distinct from to_ts;
 if slot_changed and not public.reservation_hold_available(target_id,t.id,from_ts-make_interval(mins=>buffer),to_ts,item_id) then raise exception 'Meja sudah memiliki reservasi pada rentang waktu tersebut.' using errcode='P0001'; end if;
 if slot_changed and from_ts-make_interval(mins=>buffer)<now()+interval '90 minutes' and (exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open' and o.occupies_table) or exists(select 1 from public.restaurant_reservations q where q.business_id=target_id and q.table_id=t.id and q.status='seated' and q.id<>item_id)) then raise exception 'Meja masih memiliki pesanan aktif. Pilih meja lain atau jadwal berikutnya.' using errcode='P0001'; end if;
 if old_row is null then
  insert into public.restaurant_reservations(id,business_id,actor_id,actor_name,table_id,table_name,guests,customer,phone,notes,starts_at,ends_at) values(item_id,target_id,auth.uid(),actor.name,t.id,t.name,(details->>'guests')::integer,trim(details->>'customer'),trim(details->>'phone'),trim(details->>'notes'),from_ts,to_ts) returning * into r;
 else
  update public.restaurant_reservations set table_id=t.id,table_name=t.name,guests=(details->>'guests')::integer,customer=trim(details->>'customer'),phone=trim(details->>'phone'),notes=trim(details->>'notes'),starts_at=from_ts,ends_at=to_ts,revision=revision+1,updated_at=now() where id=item_id returning * into r;
 end if;
 update public.restaurant_orders set table_id=r.table_id,table_name=r.table_name,guests=r.guests,customer=r.customer,revision=revision+1,updated_at=now()
 where reservation_id=r.id and business_id=target_id and status='open' and not occupies_table
 and (table_id is distinct from r.table_id or table_name is distinct from r.table_name or guests is distinct from r.guests or customer is distinct from r.customer);
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,to_jsonb(r));
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'reservation',item_id,old_row,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.save_restaurant_reservation(uuid,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.save_restaurant_reservation(uuid,uuid,integer,uuid,jsonb) to authenticated;

create or replace function public.sync_restaurant_reservation() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations;
begin
 if new.reservation_id is null then return new; end if;
 select * into r from public.restaurant_reservations where id=new.reservation_id;
 if new.status='cancelled' and old.status='open' and r.status not in ('cancelled','no_show') then
  if r.deposit_amount>r.deposit_refunded then raise exception 'Batalkan melalui Reservasi dan konfirmasikan refund DP terlebih dahulu.' using errcode='P0001'; end if;
  update public.restaurant_reservations set status='cancelled',cancellation_reason=new.cancellation_reason,revision=revision+1,updated_at=now() where id=r.id;
 elsif new.status='cancelled' and old.status='paid' then
  update public.restaurant_reservations set status='cancelled',cancellation_reason=new.cancellation_reason,deposit_refunded=deposit_amount,refunded_at=case when deposit_amount>0 then now() end,revision=revision+1,updated_at=now() where id=r.id;
 end if;
 return new;
end $$;
revoke all on function public.sync_restaurant_reservation() from public,anon,authenticated;

create or replace function public.save_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; o public.restaurant_orders; result jsonb; rid uuid; physical boolean:=true; buffer integer; prior public.restaurant_requests; payload jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 select * into o from public.restaurant_orders where id=item_id for update;
 if found and (o.business_id<>target_id or not(o.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin']))) then raise exception 'Order access denied' using errcode='42501'; end if;
 rid:=nullif(details->>'reservationId','')::uuid;
 if o.reservation_id is not null then
  if rid is not null and rid<>o.reservation_id then raise exception 'Reservation link is immutable' using errcode='42501'; end if;
  rid:=o.reservation_id;
 elsif o.id is not null and rid is not null then raise exception 'Pesanan lama tidak dapat ditautkan ke reservasi.' using errcode='P0001'; end if;
 if rid is not null then
  select * into r from public.restaurant_reservations where id=rid and business_id=target_id for update;
  if not found or not(r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 end if;
 payload:=jsonb_build_object('resource','order','id',item_id,'revision',expected_revision,'details',details-'reservationId');
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload or o.id is null or o.reservation_id is distinct from rid then raise exception 'Request ID already used' using errcode='22023'; end if;
  return to_jsonb(o);
 end if;
 if rid is not null then
  if r.status not in ('reserved','seated') then raise exception 'Reservasi sudah diproses atau dibatalkan.' using errcode='P0001'; end if;
  if details->>'kind' is distinct from 'dine_in' or (details->>'tableId')::uuid is distinct from r.table_id or (details->>'guests')::integer is distinct from r.guests or details->>'customer' is distinct from r.customer then raise exception 'Meja, tamu, dan pelanggan harus sesuai reservasi.' using errcode='P0001'; end if;
  physical:=r.status='seated';
  if not physical and details->>'stage' is distinct from 'new' then raise exception 'Tandai pelanggan datang sebelum memproses pesanan.' using errcode='P0001'; end if;
 end if;
 if physical and details->>'kind'='dine_in' and (o.id is null or o.table_id is distinct from (details->>'tableId')::uuid or not o.occupies_table) then
  if exists(select 1 from public.restaurant_reservations q where q.business_id=target_id and q.table_id=(details->>'tableId')::uuid and q.id is distinct from rid and q.status='seated') then raise exception 'Meja masih dipakai pelanggan reservasi.' using errcode='P0001'; end if;
  select reservation_lock_minutes into buffer from public.businesses where id=target_id;
  if rid is null and exists(select 1 from public.restaurant_reservations q where q.business_id=target_id and q.table_id=(details->>'tableId')::uuid and q.status='reserved' and q.starts_at-make_interval(mins=>buffer)<=statement_timestamp() and q.ends_at>statement_timestamp()) then raise exception 'Meja dikunci untuk reservasi. Pilih meja lain.' using errcode='P0001'; end if;
 end if;
 result:=public.save_restaurant_order_core_v2(target_id,item_id,expected_revision,operation_id,details-'reservationId',physical);
 if rid is not null then
  update public.restaurant_orders set reservation_id=rid where id=item_id returning * into o;
  result:=to_jsonb(o);
 end if;
 return result;
end $$;

create function public.arrive_restaurant_reservation(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; o public.restaurant_orders; prior public.restaurant_requests; payload jsonb; old_row jsonb; buffer integer;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 select * into r from public.restaurant_reservations where id=item_id and business_id=target_id for update;
 if not found or not(r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','arrival','id',item_id,'revision',expected_revision);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return to_jsonb(r);
 end if;
 if r.status<>'reserved' or r.revision is distinct from expected_revision then raise exception 'Reservation changed; reload' using errcode='PT409'; end if;
 select reservation_lock_minutes into buffer from public.businesses where id=target_id;
 if statement_timestamp()<r.starts_at-make_interval(mins=>buffer) or statement_timestamp()>=r.ends_at then raise exception 'Kedatangan dapat dicatat sejak waktu penguncian hingga sebelum reservasi berakhir.' using errcode='P0001'; end if;
 if not exists(select 1 from public.restaurant_tables where business_id=target_id and id=r.table_id and active and capacity>=r.guests) then raise exception 'Meja tidak tersedia atau kapasitas tidak cukup.' using errcode='P0001'; end if;
 if exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=r.table_id and status='open' and occupies_table and reservation_id is distinct from r.id)
 or exists(select 1 from public.restaurant_reservations where business_id=target_id and table_id=r.table_id and status='seated' and id<>r.id) then raise exception 'Meja masih terpakai. Selesaikan pesanan pelanggan sebelumnya sebelum mencatat kedatangan.' using errcode='P0001'; end if;
 select * into o from public.restaurant_orders where business_id=target_id and reservation_id=r.id and status='open' for update;
 if found then
  if not(o.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Order access denied' using errcode='42501'; end if;
  update public.restaurant_orders set occupies_table=true,revision=revision+1,updated_at=now() where id=o.id;
 end if;
 old_row:=to_jsonb(r);
 update public.restaurant_reservations set status='seated',revision=revision+1,updated_at=now() where id=r.id returning * into r;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,to_jsonb(r));
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'arrival',item_id,old_row,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.arrive_restaurant_reservation(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.arrive_restaurant_reservation(uuid,uuid,integer,uuid) to authenticated;

do $$
declare body text;
begin
 body:=pg_get_functiondef('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)'::regprocedure);
 body:=replace(body,'FUNCTION public.pay_restaurant_order(', 'FUNCTION public.pay_restaurant_order_before_preorders(');
 if strpos(body,'FUNCTION public.pay_restaurant_order_before_preorders(')=0 then raise exception 'Unexpected payment definition'; end if;
 execute body;
 revoke all on function public.pay_restaurant_order_before_preorders(uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated;
end $$;

create or replace function public.pay_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.restaurant_orders;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 select * into o from public.restaurant_orders where business_id=target_id and id=item_id;
 if not found or not(o.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Order access denied' using errcode='42501'; end if;
 if o.status='open' and o.reservation_id is not null and (not o.occupies_table or not exists(select 1 from public.restaurant_reservations where id=o.reservation_id and business_id=target_id and status='seated')) then raise exception 'Tandai pelanggan datang sebelum melunasi pesanan.' using errcode='P0001'; end if;
 return public.pay_restaurant_order_before_preorders(target_id,item_id,expected_revision,operation_id,details);
end $$;

create or replace function public.read_restaurant_overview(target_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare day_start timestamptz; day_end timestamptz; revenue numeric; sale_count bigint;
  open_count bigint; occupied_count bigint; menu_count bigint; table_count bigint; recent jsonb;
begin
  if not public.has_restaurant_access(target_id,array['owner','admin']) then raise exception 'Overview access denied' using errcode='42501'; end if;
  day_start:=date_trunc('day',statement_timestamp() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  day_end:=day_start+interval '24 hours';
  select coalesce(sum(s.total),0),count(*) into revenue,sale_count from public.pos_transactions s
    where s.business_id=target_id and s.status='completed' and s.created_at>=day_start and s.created_at<day_end;
  select count(*) into open_count from public.restaurant_orders o where o.business_id=target_id and o.status='open';
  select count(*) into occupied_count from public.restaurant_table_usage(target_id) u where u.occupied;
  select count(*) into menu_count from public.restaurant_menu m where m.business_id=target_id and m.active and m.available;
  select count(*) into table_count from public.restaurant_tables t where t.business_id=target_id and t.active;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc),'[]'::jsonb) into recent from (
    select o.id,o.table_name,o.stage,o.subtotal,o.created_at from public.restaurant_orders o
      where o.business_id=target_id and o.status='open' order by o.created_at desc,o.id desc limit 10
  ) p;
  return jsonb_build_object('revenue',revenue,'saleCount',sale_count,'openCount',open_count,'occupiedCount',occupied_count,'menuCount',menu_count,'tableCount',table_count,'recent',recent);
end $$;
revoke all on function public.read_restaurant_overview(uuid) from public;
grant execute on function public.read_restaurant_overview(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
