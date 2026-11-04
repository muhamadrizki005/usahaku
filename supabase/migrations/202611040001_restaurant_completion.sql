begin;

create table public.restaurant_billing_settings (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 tax_rate numeric not null default 0 check(tax_rate between 0 and 100 and tax_rate=round(tax_rate,2)),
 service_rate numeric not null default 0 check(service_rate between 0 and 100 and service_rate=round(service_rate,2)),
 tax_base text not null default 'net' check(tax_base in ('net','net_service')),
 service_scope text not null default 'dine_in' check(service_scope in ('dine_in','all')),
 revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now()
);
alter table public.restaurant_billing_settings enable row level security;
revoke all on public.restaurant_billing_settings from public,anon,authenticated;
grant select on public.restaurant_billing_settings to authenticated;
grant all on public.restaurant_billing_settings to service_role;
create policy restaurant_billing_read on public.restaurant_billing_settings for select to authenticated using(public.has_restaurant_access(business_id,array['owner','admin','cashier'],true));

alter table public.pos_transactions
 add column service_rate numeric not null default 0 check(service_rate between 0 and 100),
 add column service_amount numeric not null default 0 check(service_amount>=0),
 add column tax_base text not null default 'net' check(tax_base in ('net','net_service')),
 add column billing_revision integer not null default 0 check(billing_revision>=0);
alter table public.pos_transactions drop constraint pos_total_with_tax;
alter table public.pos_transactions add constraint pos_total_with_tax check(
 total=subtotal-discount+service_amount+tax_amount and total<=999999999999 and
 service_amount=round((subtotal-discount)*service_rate/100,0) and
 tax_amount=round((subtotal-discount+case when tax_base='net_service' then service_amount else 0 end)*tax_rate/100,0));
alter table public.restaurant_reservations drop constraint restaurant_reservations_deposit_payment_check;
alter table public.restaurant_reservations add constraint restaurant_reservations_deposit_payment_check check(deposit_payment in ('cash','qris','transfer','ewallet'));
alter table public.pos_transactions drop constraint pos_transactions_deposit_payment_check;
alter table public.pos_transactions add constraint pos_transactions_deposit_payment_check check(deposit_payment in ('cash','qris','transfer','ewallet'));

create function public.save_restaurant_billing(target_id uuid,expected_revision integer,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.restaurant_billing_settings;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id,array['owner'],true) then raise exception 'Owner access required' using errcode='42501'; end if;
 select * into b from public.restaurant_billing_settings where business_id=target_id;
 if expected_revision is null or expected_revision<>coalesce(b.revision,0) then raise exception 'Billing changed; reload' using errcode='PT409'; end if;
 if details is null or jsonb_typeof(details)<>'object' or details-array['taxRate','serviceRate','taxBase','serviceScope']<>'{}'::jsonb
 or coalesce(details->>'taxRate','') !~ '^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$' or coalesce(details->>'serviceRate','') !~ '^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$'
 or (details->>'taxRate')::numeric>100 or (details->>'serviceRate')::numeric>100
 or coalesce(details->>'taxBase','') not in ('net','net_service') or coalesce(details->>'serviceScope','') not in ('dine_in','all')
 then raise exception 'Invalid billing settings' using errcode='22023'; end if;
 insert into public.restaurant_billing_settings(business_id,tax_rate,service_rate,tax_base,service_scope)
 values(target_id,(details->>'taxRate')::numeric,(details->>'serviceRate')::numeric,details->>'taxBase',details->>'serviceScope')
 on conflict(business_id) do update set tax_rate=excluded.tax_rate,service_rate=excluded.service_rate,tax_base=excluded.tax_base,service_scope=excluded.service_scope,revision=restaurant_billing_settings.revision+1,updated_at=now() returning * into b;
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,after_row) values(target_id,auth.uid(),'billing_settings',target_id,to_jsonb(b));
 return to_jsonb(b);
end $$;
revoke all on function public.save_restaurant_billing(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_restaurant_billing(uuid,integer,jsonb) to authenticated;

create function public.restaurant_slot_within_hours(target_id uuid,from_ts timestamptz,to_ts timestamptz) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare schedule jsonb; day date; item jsonb; begins timestamptz; finishes timestamptz; covered timestamptz:=from_ts; names text[]:=array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
begin
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts>from_ts+interval '12 hours' then return false; end if;
 select operating_hours into schedule from public.businesses where id=target_id and category='restaurant';
 if schedule is null then return false; end if;
 for day in select d::date from generate_series((from_ts at time zone 'Asia/Jakarta')::date-1,(to_ts at time zone 'Asia/Jakarta')::date,interval '1 day') d loop
  item:=schedule->names[extract(isodow from day)::integer];
  if item is null or (item->>'closed')::boolean then continue; end if;
  begins:=(day::text||' '||(item->>'open'))::timestamp at time zone 'Asia/Jakarta';
  finishes:=((day+case when item->>'close'<item->>'open' then 1 else 0 end)::text||' '||(item->>'close'))::timestamp at time zone 'Asia/Jakarta';
  if begins<=covered and finishes>covered then covered:=finishes; end if;
  if covered>=to_ts then return true; end if;
 end loop;
 return false;
end $$;
revoke all on function public.restaurant_slot_within_hours(uuid,timestamptz,timestamptz) from public,anon,authenticated;

do $$
declare name text; body text;
begin
 foreach name in array array['save_restaurant_reservation','restaurant_reservation_availability'] loop
  if name='save_restaurant_reservation' then body:=pg_get_functiondef('public.save_restaurant_reservation(uuid,uuid,integer,uuid,jsonb)'::regprocedure);
  else body:=pg_get_functiondef('public.restaurant_reservation_availability(uuid,timestamptz,timestamptz,integer,uuid)'::regprocedure); end if;
  body:=replace(body,'FUNCTION public.'||name||'(', 'FUNCTION public.'||name||'_before_hours(');
  if strpos(body,'FUNCTION public.'||name||'_before_hours(')=0 then raise exception 'Unexpected function definition'; end if;
  execute body;
 end loop;
 revoke all on function public.save_restaurant_reservation_before_hours(uuid,uuid,integer,uuid,jsonb),public.restaurant_reservation_availability_before_hours(uuid,timestamptz,timestamptz,integer,uuid) from public,anon,authenticated;
end $$;

create or replace function public.save_restaurant_reservation(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.restaurant_reservations; from_ts timestamptz; to_ts timestamptz;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 select * into r from public.restaurant_reservations where id=item_id;
 if found and (r.business_id<>target_id or not(r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin']))) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if exists(select 1 from public.restaurant_requests where business_id=target_id and request_id=operation_id) then
  return public.save_restaurant_reservation_before_hours(target_id,item_id,expected_revision,operation_id,details);
 end if;
 from_ts:=(details->>'startsAt')::timestamptz;to_ts:=(details->>'endsAt')::timestamptz;
 if r.id is null or r.starts_at is distinct from from_ts or r.ends_at is distinct from to_ts or r.table_id is distinct from (details->>'tableId')::uuid then
  if not public.restaurant_slot_within_hours(target_id,from_ts,to_ts) then raise exception 'Jadwal reservasi harus seluruhnya berada dalam jam operasional. Periksa jam buka di Pengaturan.' using errcode='P0001'; end if;
 end if;
 return public.save_restaurant_reservation_before_hours(target_id,item_id,expected_revision,operation_id,details);
end $$;

create or replace function public.restaurant_reservation_availability(target_id uuid,from_ts timestamptz,to_ts timestamptz,guest_count integer,exclude_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; existing public.restaurant_reservations;
begin
 result:=public.restaurant_reservation_availability_before_hours(target_id,from_ts,to_ts,guest_count,exclude_id);
 if exclude_id is not null then select * into existing from public.restaurant_reservations where id=exclude_id and business_id=target_id; end if;
 if not public.restaurant_slot_within_hours(target_id,from_ts,to_ts) and not(existing.id is not null and existing.starts_at=from_ts and existing.ends_at=to_ts) then
  raise exception 'Jadwal reservasi harus seluruhnya berada dalam jam operasional. Periksa jam buka di Pengaturan.' using errcode='P0001';
 end if;
 if not public.restaurant_slot_within_hours(target_id,from_ts,to_ts) then
  select coalesce(jsonb_agg(value||jsonb_build_object('available',(value->>'id')::uuid=existing.table_id and (value->>'available')::boolean)),'[]') into result from jsonb_array_elements(result);
 end if;
 return result;
end $$;

create function public.restaurant_payment_guard(target_id uuid,method text,expected_revision integer default null) returns void
language plpgsql stable security definer set search_path='' as $$
declare p public.business_payments;
begin
 select * into p from public.business_payments where business_id=target_id;
 if expected_revision is not null and expected_revision<>coalesce(p.revision,0) then raise exception 'Metode pembayaran berubah. Muat ulang sebelum menerima pembayaran.' using errcode='P0001'; end if;
 if method is null or method not in ('cash','qris','transfer','ewallet') then raise exception 'Invalid payment' using errcode='22023'; end if;
 if (p.business_id is null and method='ewallet') or (p.business_id is not null and not(case method when 'cash' then p.cash when 'qris' then p.qris when 'transfer' then p.transfer when 'ewallet' then p.ewallet else false end)) then
  raise exception 'Metode pembayaran ini tidak aktif. Pilih metode yang diaktifkan owner.' using errcode='P0001';
 end if;
end $$;
revoke all on function public.restaurant_payment_guard(uuid,text,integer) from public,anon,authenticated;

create or replace function public.reserve_payment_qr(target_id uuid,asset_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare path text:=target_id::text||'/'||asset_id::text||'.png';
begin
 perform 1 from public.businesses where id=target_id and category in ('store','restaurant') for update;
 if not found or not public.has_business_access(target_id,array['owner']) then raise exception 'Payment access denied' using errcode='42501'; end if;
 if asset_id is null then raise exception 'Invalid asset' using errcode='22023'; end if;
 insert into public.business_payment_assets(id,business_id,path) values(asset_id,target_id,path);
 return path;
end $$;

drop policy payment_settings_read on public.business_payments;
create policy payment_settings_read on public.business_payments for select to authenticated using(public.has_business_access(business_id,array['owner']) or public.has_business_permission(business_id,'pos:view') or public.has_restaurant_access(business_id));
drop policy payment_asset_read on public.business_payment_assets;
create policy payment_asset_read on public.business_payment_assets for select to authenticated using(
 (public.has_business_access(business_id,array['owner']) or public.has_business_permission(business_id,'pos:view') or public.has_restaurant_access(business_id)) and state='active'
 and exists(select 1 from public.business_payments p where p.business_id=business_payment_assets.business_id and p.qris_asset=business_payment_assets.id));
drop policy payment_qr_read on storage.objects;
create policy payment_qr_read on storage.objects for select to authenticated using(bucket_id='business-payment-qr' and exists(
 select 1 from public.business_payment_assets a join public.business_payments p on p.business_id=a.business_id and p.qris_asset=a.id
 where a.path=storage.objects.name and a.state='active' and (public.has_business_access(a.business_id,array['owner']) or public.has_business_permission(a.business_id,'pos:view') or public.has_restaurant_access(a.business_id))));

create or replace function public.record_restaurant_deposit(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,amount numeric,payment_method text,confirmed boolean) returns jsonb
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
 perform public.restaurant_payment_guard(target_id,payment_method,null);
 select * into r from public.restaurant_reservations where id=item_id and business_id=target_id for update;
 if not found or not (r.actor_id=auth.uid() or public.has_restaurant_access(target_id,array['owner','admin'])) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if r.status<>'reserved' or r.revision is distinct from expected_revision or r.deposit_amount>0 then raise exception 'Reservation or deposit changed; reload' using errcode='PT409'; end if;
 if confirmed is distinct from true or amount is null or amount<=0 or amount>999999999999 or amount<>trunc(amount) or payment_method is null or payment_method not in ('cash','qris','transfer','ewallet') then raise exception 'Invalid deposit confirmation' using errcode='22023'; end if;
 old_row:=to_jsonb(r);
 update public.restaurant_reservations set deposit_amount=amount,deposit_payment=payment_method,deposit_at=now(),deposit_actor=auth.uid(),revision=revision+1,updated_at=now() where id=item_id returning * into r;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,to_jsonb(r));
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'deposit',item_id,old_row,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.record_restaurant_deposit(uuid,uuid,integer,uuid,numeric,text,boolean) from public,anon;
grant execute on function public.record_restaurant_deposit(uuid,uuid,integer,uuid,numeric,text,boolean) to authenticated;


create function public.record_restaurant_deposit_checked(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,amount numeric,payment_method text,confirmed boolean,payment_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Reservation access denied' using errcode='42501'; end if;
 if payment_revision is null or payment_revision<0 then raise exception 'Invalid payment revision' using errcode='22023'; end if;
 if payment_method is null or payment_method not in ('cash','qris','transfer','ewallet') then raise exception 'Invalid deposit confirmation' using errcode='22023'; end if;
 if not exists(select 1 from public.restaurant_requests where business_id=target_id and request_id=operation_id) then perform public.restaurant_payment_guard(target_id,payment_method,payment_revision); end if;
 return public.record_restaurant_deposit(target_id,item_id,expected_revision,operation_id,amount,payment_method,confirmed);
end $$;
revoke all on function public.record_restaurant_deposit_checked(uuid,uuid,integer,uuid,numeric,text,boolean,integer) from public,anon;
grant execute on function public.record_restaurant_deposit_checked(uuid,uuid,integer,uuid,numeric,text,boolean,integer) to authenticated;

create or replace function public.create_restaurant_reservation_bundle(target_id uuid,item_id uuid,operation_id uuid,details jsonb,meal jsonb default null,deposit jsonb default null) returns jsonb
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
 if deposit is not null and (jsonb_typeof(deposit)<>'object' or deposit-array['amount','payment','confirmed','paymentRevision']<>'{}'::jsonb
  or coalesce(deposit->>'amount','') !~ '^[1-9][0-9]{0,11}$' or deposit->'confirmed' is distinct from 'true'::jsonb) then raise exception 'Invalid deposit confirmation' using errcode='22023'; end if;
 result:=public.save_restaurant_reservation(target_id,item_id,null,gen_random_uuid(),details);
 if meal is not null then
  o:=public.save_restaurant_order(target_id,gen_random_uuid(),null,gen_random_uuid(),jsonb_build_object(
   'kind','dine_in','tableId',result->>'table_id','guests',(result->>'guests')::integer,'customer',result->>'customer',
   'notes',meal->>'notes','stage','new','lines',meal->'lines','reservationId',item_id));
 end if;
 if deposit is not null then
  if o is not null and (deposit->>'amount')::numeric>(o->>'subtotal')::numeric then raise exception 'DP tidak boleh melebihi subtotal pesanan. Kurangi nominal DP atau periksa menu.' using errcode='P0001'; end if;
  result:=public.record_restaurant_deposit_checked(target_id,item_id,(result->>'revision')::integer,gen_random_uuid(),(deposit->>'amount')::numeric,deposit->>'payment',(deposit->>'confirmed')::boolean,coalesce((deposit->>'paymentRevision')::integer,0));
 end if;
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.create_restaurant_reservation_bundle(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_restaurant_reservation_bundle(uuid,uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.pay_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.restaurant_orders; old_row jsonb; sale public.pos_transactions; actor public.business_members;
  prior public.restaurant_requests; payload jsonb; result jsonb; discount_kind text; payment text; discount_value numeric; discount numeric; total numeric; received numeric; original_received numeric; deposit numeric:=0; r public.restaurant_reservations; billing public.restaurant_billing_settings; service_rate numeric:=0; service_amount numeric:=0; tax_amount numeric:=0; net numeric;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id) then raise exception 'Payment access denied' using errcode='42501'; end if;
  select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('resource','payment','id',item_id,'revision',expected_revision,'details',details);
  select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
    select * into sale from public.pos_transactions where id=(prior.response->'sale'->>'id')::uuid;
    select * into o from public.restaurant_orders where id=item_id;
    return jsonb_build_object('order',to_jsonb(o),'sale',to_jsonb(sale));
  end if;
  select * into o from public.restaurant_orders where id=item_id and business_id=target_id for update;
  if not found or (actor.role='cashier' and o.actor_id is distinct from auth.uid()) then raise exception 'Order access denied' using errcode='42501'; end if;
  if o.status='open' and o.reservation_id is not null then
    select * into r from public.restaurant_reservations where id=o.reservation_id and business_id=target_id for update;
    if not found or r.status<>'seated' or not o.occupies_table then raise exception 'Tandai pelanggan datang sebelum melunasi pesanan.' using errcode='P0001'; end if;
    deposit:=r.deposit_amount-r.deposit_refunded;
  end if;
  perform public.restaurant_require_open(o.status,o.revision,expected_revision);
  old_row:=to_jsonb(o);
  if details is null or jsonb_typeof(details)<>'object' or details-array['payment','received','discountKind','discountValue','confirmed','paymentRevision','billingRevision']<>'{}'::jsonb
    or details->'confirmed' is distinct from 'true'::jsonb or coalesce(details->>'payment','') not in ('cash','qris','transfer','ewallet')
    or coalesce(details->>'discountKind','') not in ('none','amount','percent')
    or coalesce(details->>'discountValue','') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    or coalesce(details->>'received','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid payment' using errcode='22023'; end if;
  if coalesce(details->>'paymentRevision','0') !~ '^[0-9]{1,9}$' or coalesce(details->>'billingRevision','0') !~ '^[0-9]{1,9}$' then raise exception 'Invalid settings revision' using errcode='22023'; end if;
  perform public.restaurant_payment_guard(target_id,details->>'payment',coalesce((details->>'paymentRevision')::integer,0));
  select * into billing from public.restaurant_billing_settings where business_id=target_id;
  if coalesce((details->>'billingRevision')::integer,0)<>coalesce(billing.revision,0) then raise exception 'Pengaturan pajak atau biaya layanan berubah. Muat ulang sebelum pembayaran.' using errcode='P0001'; end if;
  discount_kind:=details->>'discountKind'; discount_value:=(details->>'discountValue')::numeric; payment:=details->>'payment'; received:=(details->>'received')::numeric;
  if (discount_kind='none' and discount_value<>0) or (discount_kind='amount' and discount_value<>trunc(discount_value)) or (discount_kind='percent' and discount_value>100) then raise exception 'Invalid discount' using errcode='22023'; end if;
  if discount_kind<>'none' and actor.role='cashier' then raise exception 'Discount access denied' using errcode='42501'; end if;
  discount:=case discount_kind when 'amount' then discount_value when 'percent' then round(o.subtotal*discount_value/100,0) else 0 end;
  if discount>o.subtotal then raise exception 'Discount exceeds subtotal' using errcode='22023'; end if;
  net:=o.subtotal-discount;
  service_rate:=case when billing.service_scope='all' or o.kind='dine_in' then coalesce(billing.service_rate,0) else 0 end;
  service_amount:=round(net*service_rate/100,0);
  tax_amount:=round((net+case when billing.tax_base='net_service' then service_amount else 0 end)*coalesce(billing.tax_rate,0)/100,0);
  total:=net+service_amount+tax_amount;
  if total>999999999999 then raise exception 'Total exceeds limit' using errcode='22023'; end if;
  if deposit>total then raise exception 'DP melebihi tagihan. Sesuaikan pesanan/diskon atau batalkan reservasi dengan refund penuh dahulu.' using errcode='P0001'; end if;
  original_received:=received;received:=received+deposit;
  if received<total then raise exception 'Invalid received amount' using errcode='22023',detail=jsonb_build_object('reason','payment_short','received',received,'total',total)::text; end if;
  if received>999999999999 then raise exception 'Invalid received amount' using errcode='22023',detail='{"reason":"payment_limit"}'; end if;
  if payment<>'cash' and received<>total then raise exception 'Invalid received amount' using errcode='22023',detail=jsonb_build_object('reason','payment_exact','total',total)::text; end if;
  insert into public.pos_transactions(business_id,actor_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,deposit_amount,deposit_payment,balance_received,tax_rate,tax_amount,service_rate,service_amount,tax_base,billing_revision)
    values(target_id,auth.uid(),actor.name,o.customer,o.lines,o.subtotal,discount_kind,discount_value,discount,total,payment,received,received-total,deposit,case when deposit>0 then r.deposit_payment else null end,original_received,coalesce(billing.tax_rate,0),tax_amount,service_rate,service_amount,coalesce(billing.tax_base,'net'),coalesce(billing.revision,0)) returning * into sale;
  update public.restaurant_orders set status='paid',sale_id=sale.id,revision=revision+1,updated_at=now() where id=item_id returning * into o;
  if o.reservation_id is not null then update public.restaurant_reservations set status='completed',revision=revision+1,updated_at=now() where id=o.reservation_id and status='seated'; end if;
  result:=jsonb_build_object('order',to_jsonb(o),'sale',to_jsonb(sale));
  insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'payment',item_id,old_row,to_jsonb(o));
  return result;
end $$;

create function public.restaurant_deposit_events(target_id uuid)
returns table(reservation_id uuid,customer text,table_name text,starts_at timestamptz,status text,event_at timestamptz,event_kind text,payment text,amount numeric)
language sql stable security definer set search_path='' as $$
 select r.id,r.customer,r.table_name,r.starts_at,r.status,r.deposit_at,'received',r.deposit_payment,r.deposit_amount
 from public.restaurant_reservations r where r.business_id=target_id and r.deposit_amount>0 and r.deposit_at is not null
 union all
 select r.id,r.customer,r.table_name,r.starts_at,r.status,s.created_at,'applied',s.deposit_payment,s.deposit_amount
 from public.restaurant_reservations r join public.restaurant_orders o on o.reservation_id=r.id and o.business_id=r.business_id join public.pos_transactions s on s.id=o.sale_id and s.business_id=r.business_id
 where r.business_id=target_id and s.deposit_amount>0
 union all
 select r.id,r.customer,r.table_name,r.starts_at,r.status,r.refunded_at,'refund_reservation',r.deposit_payment,r.deposit_refunded
 from public.restaurant_reservations r where r.business_id=target_id and r.deposit_refunded>0 and r.refunded_at is not null
 and not exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.reservation_id=r.id and o.sale_id is not null)
 union all
 select r.id,r.customer,r.table_name,r.starts_at,r.status,s.cancelled_at,'refund_sale',s.deposit_payment,s.deposit_amount
 from public.restaurant_reservations r join public.restaurant_orders o on o.reservation_id=r.id and o.business_id=r.business_id join public.pos_transactions s on s.id=o.sale_id and s.business_id=r.business_id
 where r.business_id=target_id and s.status='cancelled' and s.cancelled_at is not null and s.deposit_amount>0
$$;
revoke all on function public.restaurant_deposit_events(uuid) from public,anon,authenticated;

create function public.read_restaurant_deposit_report(target_id uuid,from_ts timestamptz,to_ts timestamptz,payment_method text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare events jsonb; outstanding jsonb; summary jsonb; n bigint;
begin
 if not public.has_restaurant_access(target_id,array['owner','admin']) or not public.has_business_permission(target_id,'reports:view') then raise exception 'Deposit report access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts>from_ts+interval '366 days'
 or payment_method is null or payment_method not in ('all','cash','qris','transfer','ewallet') then raise exception 'Invalid report filter' using errcode='22023'; end if;
 select count(*) into n from public.restaurant_deposit_events(target_id) e where e.event_at>=from_ts and e.event_at<to_ts and (payment_method='all' or e.payment=payment_method);
 if n>20000 then raise exception 'Report too large' using errcode='PT413'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.event_at,q.reservation_id,q.event_kind),'[]') into events from (
 select e.reservation_id,e.customer,e.table_name,e.starts_at,e.status,e.event_at,e.event_kind,e.payment,e.amount::text as amount
 from public.restaurant_deposit_events(target_id) e where e.event_at>=from_ts and e.event_at<to_ts and (payment_method='all' or e.payment=payment_method)
 ) q;
 with amounts as(
 select
 coalesce(sum(case when event_at<from_ts then case event_kind when 'received' then amount when 'applied' then -amount when 'refund_reservation' then -amount else 0 end else 0 end),0) opening,
 coalesce(sum(case when event_at<to_ts then case event_kind when 'received' then amount when 'applied' then -amount when 'refund_reservation' then -amount else 0 end else 0 end),0) closing,
 coalesce(sum(amount) filter(where event_at>=from_ts and event_at<to_ts and event_kind='received'),0) received,
 coalesce(sum(amount) filter(where event_at>=from_ts and event_at<to_ts and event_kind='applied'),0) applied,
 coalesce(sum(amount) filter(where event_at>=from_ts and event_at<to_ts and event_kind='refund_reservation'),0) refund_reservation,
 coalesce(sum(amount) filter(where event_at>=from_ts and event_at<to_ts and event_kind='refund_sale'),0) refund_sale
 from public.restaurant_deposit_events(target_id) where payment_method='all' or payment=payment_method)
 select jsonb_build_object('opening',opening::text,'closing',closing::text,'received',received::text,'applied',applied::text,'refundReservation',refund_reservation::text,'refundSale',refund_sale::text,'cashNet',(received-refund_reservation-refund_sale)::text) into summary from amounts;
 with balances as(
 select reservation_id,sum(case event_kind when 'received' then amount when 'applied' then -amount when 'refund_reservation' then -amount else 0 end) amount
 from public.restaurant_deposit_events(target_id) where event_at<to_ts and (payment_method='all' or payment=payment_method) group by reservation_id)
 select count(*) into n from balances where amount<>0;
 if n>20000 then raise exception 'Report too large' using errcode='PT413'; end if;
 with balances as(
 select reservation_id,sum(case event_kind when 'received' then amount when 'applied' then -amount when 'refund_reservation' then -amount else 0 end) amount
 from public.restaurant_deposit_events(target_id) where event_at<to_ts and (payment_method='all' or payment=payment_method) group by reservation_id)
 select coalesce(jsonb_agg(jsonb_build_object('reservation_id',r.id,'customer',r.customer,'table_name',r.table_name,'starts_at',r.starts_at,'status',r.status,'payment',r.deposit_payment,'amount',b.amount::text) order by r.starts_at,r.id),'[]') into outstanding
 from balances b join public.restaurant_reservations r on r.id=b.reservation_id and r.business_id=target_id where b.amount<>0;
 return jsonb_build_object('summary',summary,'events',events,'outstanding',outstanding,'generatedAt',statement_timestamp());
end $$;
revoke all on function public.read_restaurant_deposit_report(uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.read_restaurant_deposit_report(uuid,timestamptz,timestamptz,text) to authenticated;

create or replace function public.read_restaurant_overview(target_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare day_start timestamptz; day_end timestamptz; revenue numeric; sale_count bigint;
  open_count bigint; occupied_count bigint; menu_count bigint; table_count bigint; recent jsonb;
begin
  if not public.has_restaurant_access(target_id,array['owner','admin']) then raise exception 'Overview access denied' using errcode='42501'; end if;
  day_start:=date_trunc('day',statement_timestamp() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  day_end:=day_start+interval '24 hours';
  select coalesce(sum(s.total-s.tax_amount),0),count(*) into revenue,sale_count from public.pos_transactions s
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
