begin;

create table public.restaurant_reservations (
 id uuid primary key, business_id uuid not null references public.businesses(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null, actor_name text not null,
 table_id uuid not null, table_name text not null, guests integer not null check(guests between 1 and 1000),
 customer text not null check(char_length(customer) between 1 and 100), phone text not null check(char_length(phone) between 8 and 30),
 notes text not null default '' check(char_length(notes)<=300),
 starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'reserved' check(status in ('reserved','seated','completed','cancelled','no_show')),
 deposit_amount numeric not null default 0 check(deposit_amount between 0 and 999999999999 and deposit_amount=trunc(deposit_amount)),
 deposit_payment text check(deposit_payment in ('cash','qris','transfer')), deposit_at timestamptz, deposit_actor uuid references auth.users(id) on delete set null,
 deposit_refunded numeric not null default 0 check(deposit_refunded>=0 and deposit_refunded<=deposit_amount), refunded_at timestamptz,
 cancellation_reason text, revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,id), foreign key(business_id,table_id) references public.restaurant_tables(business_id,id),
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at<=starts_at+interval '12 hours'),
 check((deposit_amount=0 and deposit_payment is null and deposit_at is null) or (deposit_amount>0 and deposit_payment is not null and deposit_at is not null))
);
create index restaurant_reservation_slots on public.restaurant_reservations(business_id,table_id,starts_at,ends_at) where status in ('reserved','seated');
create index restaurant_reservation_history on public.restaurant_reservations(business_id,starts_at desc,id);
alter table public.restaurant_reservations enable row level security;
revoke all on public.restaurant_reservations from public,anon,authenticated;
grant select on public.restaurant_reservations to authenticated;
grant all on public.restaurant_reservations to service_role;
create policy reservation_read on public.restaurant_reservations for select to authenticated using(
 public.has_restaurant_access(business_id,array['owner','admin']) or (public.has_restaurant_access(business_id,array['cashier']) and actor_id=auth.uid()));

alter table public.restaurant_orders add column reservation_id uuid;
alter table public.restaurant_orders add constraint restaurant_order_reservation foreign key(business_id,reservation_id) references public.restaurant_reservations(business_id,id);
create unique index restaurant_reservation_one_order on public.restaurant_orders(reservation_id) where reservation_id is not null;
alter table public.pos_transactions add column deposit_amount numeric not null default 0 check(deposit_amount>=0 and deposit_amount<=total and deposit_amount=trunc(deposit_amount));
alter table public.pos_transactions add column deposit_payment text check(deposit_payment in ('cash','qris','transfer'));
alter table public.pos_transactions add column balance_received numeric check(balance_received>=0 and balance_received=trunc(balance_received));

create function public.reservation_slot_available(target_id uuid,table_key uuid,from_ts timestamptz,to_ts timestamptz,exclude_id uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.restaurant_reservations r where r.business_id=target_id and r.table_id=table_key and r.id is distinct from exclude_id and r.status in ('reserved','seated') and r.starts_at<to_ts and r.ends_at>from_ts)
$$;
revoke all on function public.reservation_slot_available(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

create function public.read_restaurant_reservations(target_id uuid,day_text text,requested_page integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare from_ts timestamptz; total bigint; page integer; items jsonb;
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if day_text is null or day_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or requested_page is null or requested_page<0 or requested_page>1000000 then raise exception 'Invalid reservation date' using errcode='22023'; end if;
 from_ts:=(day_text::date::text||' 00:00:00 Asia/Jakarta')::timestamptz;
 select count(*) into total from public.restaurant_reservations where business_id=target_id and starts_at<from_ts+interval '1 day' and ends_at>from_ts;
 page:=least(requested_page,greatest(0,ceil(total/25.0)::integer-1));
 select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at,q.id),'[]'::jsonb) into items from (select * from public.restaurant_reservations where business_id=target_id and starts_at<from_ts+interval '1 day' and ends_at>from_ts order by starts_at,id limit 25 offset page*25) q;
 return jsonb_build_object('items',items,'total',total,'page',page,'pageSize',25);
end $$;
revoke all on function public.read_restaurant_reservations(uuid,text,integer) from public,anon;
grant execute on function public.read_restaurant_reservations(uuid,text,integer) to authenticated;

create function public.restaurant_reservation_availability(target_id uuid,from_ts timestamptz,to_ts timestamptz,guest_count integer,exclude_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts>from_ts+interval '12 hours' or guest_count is null or guest_count not between 1 and 1000 then raise exception 'Invalid slot' using errcode='22023'; end if;
 if exclude_id is not null and not exists(select 1 from public.restaurant_reservations r where r.id=exclude_id and r.business_id=target_id and (r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin']))) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'capacity',t.capacity,'available',
  public.reservation_slot_available(target_id,t.id,from_ts,to_ts,exclude_id) and not (from_ts<now()+interval '90 minutes' and exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open')))
  order by t.name,t.id),'[]'::jsonb) into items from public.restaurant_tables t where t.business_id=target_id and t.active and t.capacity>=guest_count;
 return items;
end $$;
revoke all on function public.restaurant_reservation_availability(uuid,timestamptz,timestamptz,integer,uuid) from public,anon;
grant execute on function public.restaurant_reservation_availability(uuid,timestamptz,timestamptz,integer,uuid) to authenticated;

create function public.save_restaurant_reservation(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; t public.restaurant_tables; actor public.business_members; prior public.restaurant_requests; payload jsonb; old_row jsonb; from_ts timestamptz; to_ts timestamptz;
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
 if not public.reservation_slot_available(target_id,t.id,from_ts,to_ts,item_id) then raise exception 'Meja sudah memiliki reservasi pada rentang waktu tersebut.' using errcode='P0001'; end if;
 if from_ts<now()+interval '90 minutes' and exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open') then raise exception 'Meja masih memiliki pesanan aktif. Pilih meja lain atau jadwal berikutnya.' using errcode='P0001'; end if;
 if old_row is null then
  insert into public.restaurant_reservations(id,business_id,actor_id,actor_name,table_id,table_name,guests,customer,phone,notes,starts_at,ends_at) values(item_id,target_id,auth.uid(),actor.name,t.id,t.name,(details->>'guests')::integer,trim(details->>'customer'),trim(details->>'phone'),trim(details->>'notes'),from_ts,to_ts) returning * into r;
 else
  update public.restaurant_reservations set table_id=t.id,table_name=t.name,guests=(details->>'guests')::integer,customer=trim(details->>'customer'),phone=trim(details->>'phone'),notes=trim(details->>'notes'),starts_at=from_ts,ends_at=to_ts,revision=revision+1,updated_at=now() where id=item_id returning * into r;
 end if;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,to_jsonb(r));
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'reservation',item_id,old_row,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.save_restaurant_reservation(uuid,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.save_restaurant_reservation(uuid,uuid,integer,uuid,jsonb) to authenticated;

create function public.record_restaurant_deposit(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,amount numeric,payment_method text,confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; prior public.restaurant_requests; payload jsonb; old_row jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','deposit','id',item_id,'revision',expected_revision,'amount',amount,'payment',payment_method,'confirmed',confirmed);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 select * into r from public.restaurant_reservations where id=item_id and business_id=target_id for update;
 if not found or not (r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if r.status<>'reserved' or r.revision is distinct from expected_revision or r.deposit_amount>0 then raise exception 'Reservation or deposit changed; reload' using errcode='PT409'; end if;
 if confirmed is distinct from true or amount is null or amount<=0 or amount>999999999999 or amount<>trunc(amount) or payment_method is null or payment_method not in ('cash','qris','transfer') then raise exception 'Invalid deposit confirmation' using errcode='22023'; end if;
 old_row:=to_jsonb(r);
 update public.restaurant_reservations set deposit_amount=amount,deposit_payment=payment_method,deposit_at=now(),deposit_actor=auth.uid(),revision=revision+1,updated_at=now() where id=item_id returning * into r;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,to_jsonb(r));
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'deposit',item_id,old_row,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.record_restaurant_deposit(uuid,uuid,integer,uuid,numeric,text,boolean) from public,anon;
grant execute on function public.record_restaurant_deposit(uuid,uuid,integer,uuid,numeric,text,boolean) to authenticated;

-- Private copies preserve the installed order/payment implementation.
do $$
declare name text; signature regprocedure; body text;
begin
 foreach name in array array['save_restaurant_order','pay_restaurant_order'] loop
  signature:=to_regprocedure('public.'||name||'(uuid,uuid,integer,uuid,jsonb)');
  if signature is null then raise exception 'Required restaurant function missing: %',name; end if;
  body:=pg_get_functiondef(signature);
  body:=replace(body,'FUNCTION public.'||name||'(', 'FUNCTION public.'||name||'_before_reservations(');
  if strpos(body,'FUNCTION public.'||name||'_before_reservations(')=0 then raise exception 'Unexpected function definition'; end if;
  execute body;
  execute 'revoke all on function public.'||name||'_before_reservations(uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated';
 end loop;
end $$;

create or replace function public.save_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; o public.restaurant_orders; result jsonb; rid uuid;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 rid:=nullif(details->>'reservationId','')::uuid;
 select * into o from public.restaurant_orders where id=item_id and business_id=target_id;
 if o.reservation_id is not null then
  if rid is not null and rid<>o.reservation_id then raise exception 'Reservation link is immutable' using errcode='42501'; end if;
  rid:=o.reservation_id;
 end if;
 if rid is not null then
  select * into r from public.restaurant_reservations where id=rid and business_id=target_id for update;
  if not found or not (r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
  if r.status not in ('reserved','seated') or (r.status='seated' and not exists(select 1 from public.restaurant_orders where id=item_id and reservation_id=rid)) then raise exception 'Reservasi sudah diproses atau dibatalkan.' using errcode='P0001'; end if;
  if r.status='reserved' and (now()<r.starts_at-interval '15 minutes' or now()>=r.ends_at) then raise exception 'Buka pesanan mulai 15 menit sebelum kedatangan hingga sebelum akhir reservasi.' using errcode='P0001'; end if;
  if details->>'kind'<>'dine_in' or (details->>'tableId')::uuid<>r.table_id or (details->>'guests')::integer<>r.guests or details->>'customer'<>r.customer then raise exception 'Meja, tamu, dan pelanggan harus sesuai reservasi.' using errcode='P0001'; end if;
 end if;
 if details->>'kind'='dine_in' and (o.id is null or o.table_id is distinct from (details->>'tableId')::uuid) and not public.reservation_slot_available(target_id,(details->>'tableId')::uuid,now(),now()+interval '90 minutes',rid) then raise exception 'Meja memiliki reservasi dalam 90 menit ke depan. Pilih meja lain.' using errcode='P0001'; end if;
 result:=public.save_restaurant_order_before_reservations(target_id,item_id,expected_revision,operation_id,details-'reservationId');
 if rid is not null then
  if o.reservation_id is null and o.id is not null then raise exception 'Pesanan lama tidak dapat ditautkan ke reservasi.' using errcode='P0001'; end if;
  update public.restaurant_orders set reservation_id=rid where id=item_id returning * into o;
  update public.restaurant_reservations set status='seated',revision=revision+1,updated_at=now() where id=rid and status='reserved';
  result:=to_jsonb(o);
 end if;
 return result;
end $$;

create or replace function public.pay_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; o public.restaurant_orders; sale public.pos_transactions; result jsonb; original numeric; deposit numeric:=0; paid_total numeric;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
 select * into o from public.restaurant_orders where id=item_id and business_id=target_id;
 if not found or not (o.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Order access denied' using errcode='42501'; end if;
 if o.reservation_id is not null then
  select * into r from public.restaurant_reservations where id=o.reservation_id and business_id=target_id for update;
  deposit:=case when o.sale_id is not null then r.deposit_amount else r.deposit_amount-r.deposit_refunded end;
 end if;
 if coalesce(details->>'received','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid received amount' using errcode='22023'; end if;
 original:=(details->>'received')::numeric;
 if deposit>0 then
  paid_total:=o.subtotal-case details->>'discountKind' when 'amount' then (details->>'discountValue')::numeric when 'percent' then round(o.subtotal*(details->>'discountValue')::numeric/100,0) else 0 end;
  if deposit>paid_total then raise exception 'DP melebihi tagihan. Sesuaikan pesanan/diskon atau batalkan reservasi dengan refund penuh dahulu.' using errcode='P0001'; end if;
 end if;
 result:=public.pay_restaurant_order_before_reservations(target_id,item_id,expected_revision,operation_id,jsonb_set(details,'{received}',to_jsonb((original+deposit)::text)));
 if deposit>0 then
  update public.pos_transactions set deposit_amount=deposit,deposit_payment=r.deposit_payment,balance_received=original where id=(result->'sale'->>'id')::uuid and deposit_amount=0;
 end if;
 select * into sale from public.pos_transactions where id=(result->'sale'->>'id')::uuid;
 if o.reservation_id is not null then update public.restaurant_reservations set status='completed',revision=revision+1,updated_at=now() where id=r.id and status='seated'; end if;
 return jsonb_build_object('order',result->'order','sale',to_jsonb(sale));
end $$;

create function public.close_restaurant_reservation(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,reason text,no_show boolean,refund_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; o public.restaurant_orders; prior public.restaurant_requests; payload jsonb; old_row jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 payload:=jsonb_build_object('resource','close_reservation','id',item_id,'revision',expected_revision,'reason',reason,'noShow',no_show,'refund',refund_confirmed);
 if operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 select * into r from public.restaurant_reservations where id=item_id and business_id=target_id for update;
 if not found or not (r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if r.status not in ('reserved','seated') or r.revision is distinct from expected_revision then raise exception 'Reservation changed; reload' using errcode='PT409'; end if;
 if reason is null or char_length(trim(reason)) not between 3 and 300 or no_show is null then raise exception 'Cancellation reason required' using errcode='22023'; end if;
 if no_show and (r.status<>'reserved' or now()<r.starts_at+interval '15 minutes') then raise exception 'Tandai tidak hadir setelah toleransi 15 menit.' using errcode='P0001'; end if;
 if r.deposit_amount>0 and (not public.has_restaurant_access(target_id,array['owner','admin']) or refund_confirmed is distinct from true) then raise exception 'Owner/admin harus mengonfirmasi refund DP penuh secara manual.' using errcode='P0001'; end if;
 old_row:=to_jsonb(r);
 update public.restaurant_reservations set status=case when no_show then 'no_show' else 'cancelled' end,cancellation_reason=trim(reason),deposit_refunded=deposit_amount,refunded_at=case when deposit_amount>0 then now() end,revision=revision+1,updated_at=now() where id=item_id returning * into r;
 select * into o from public.restaurant_orders where reservation_id=item_id and business_id=target_id and status='open' for update;
 if found then perform public.cancel_restaurant_order(target_id,o.id,o.revision,reason); end if;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,to_jsonb(r));
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'reservation_cancel',item_id,old_row,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.close_restaurant_reservation(uuid,uuid,integer,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.close_restaurant_reservation(uuid,uuid,integer,uuid,text,boolean,boolean) to authenticated;

create function public.sync_restaurant_reservation() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations;
begin
 if new.reservation_id is null then return new; end if;
 select * into r from public.restaurant_reservations where id=new.reservation_id;
 if new.status='cancelled' and old.status='open' and r.status<>'cancelled' then
  if r.deposit_amount>r.deposit_refunded then raise exception 'Batalkan melalui Reservasi dan konfirmasikan refund DP terlebih dahulu.' using errcode='P0001'; end if;
  update public.restaurant_reservations set status='cancelled',cancellation_reason=new.cancellation_reason,revision=revision+1,updated_at=now() where id=r.id;
 elsif new.status='cancelled' and old.status='paid' then
  update public.restaurant_reservations set status='cancelled',cancellation_reason=new.cancellation_reason,deposit_refunded=deposit_amount,refunded_at=case when deposit_amount>0 then now() end,revision=revision+1,updated_at=now() where id=r.id;
 end if;
 return new;
end $$;
revoke all on function public.sync_restaurant_reservation() from public,anon,authenticated;
create trigger sync_restaurant_reservation after update of status on public.restaurant_orders for each row execute function public.sync_restaurant_reservation();

create function public.protect_reserved_restaurant_table() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.restaurant_reservations r where r.business_id=new.business_id and r.table_id=new.id and r.status in ('reserved','seated') and (not new.active or r.guests>new.capacity)) then raise exception 'Meja memiliki reservasi aktif. Pindahkan atau batalkan reservasi sebelum mengubah kapasitas/status meja.' using errcode='P0001'; end if;
 return new;
end $$;
revoke all on function public.protect_reserved_restaurant_table() from public,anon,authenticated;
create trigger protect_reserved_restaurant_table before update on public.restaurant_tables for each row execute function public.protect_reserved_restaurant_table();

notify pgrst,'reload schema';
commit;
