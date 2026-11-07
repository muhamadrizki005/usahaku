begin;

create table public.salon_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 120),
 tax_rate numeric not null default 0 check(tax_rate between 0 and 100 and tax_rate=round(tax_rate,2)),
 revision integer not null default 1 check(revision>0)
);
create table public.salon_visits(
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 actor_name text not null,
 practitioner_id uuid not null,
 practitioner_name text not null,
 customer_id uuid,
 customer text not null check(char_length(customer) between 1 and 100),
 phone text not null default '', notes text not null default '' check(char_length(notes)<=1000),
 kind text not null check(kind in ('appointment','walk_in')),
 starts_at timestamptz not null, ends_at timestamptz not null,
 buffer_minutes integer not null check(buffer_minutes between 0 and 120),
 busy_until timestamptz not null,
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 20),
 subtotal numeric not null check(subtotal between 0 and 999999999999 and subtotal=trunc(subtotal)),
 status text not null default 'scheduled' check(status in ('scheduled','waiting','in_service','finished','cancelled','no_show')),
 arrived_at timestamptz, started_at timestamptz, finished_at timestamptz,
 deposit_amount numeric not null default 0 check(deposit_amount between 0 and subtotal and deposit_amount=trunc(deposit_amount)),
 deposit_payment text check(deposit_payment in ('cash','qris','transfer','ewallet')), deposit_at timestamptz,
 deposit_refunded numeric not null default 0 check(deposit_refunded in (0,deposit_amount)), refunded_at timestamptz,
 sale_id uuid, cancellation_reason text,
 revision integer not null default 1 check(revision>0), created_at timestamptz not null default now(),
 unique(business_id,id),
 foreign key(business_id,practitioner_id) references public.salon_practitioners(business_id,id),
 foreign key(business_id,customer_id) references public.customers(business_id,id),
 foreign key(business_id,sale_id) references public.pos_transactions(business_id,id),
 check(ends_at>starts_at and ends_at-starts_at<=interval '12 hours'),
 check(busy_until=ends_at+buffer_minutes*interval '1 minute'),
 check((deposit_amount=0 and deposit_at is null and deposit_payment is null) or (deposit_amount>0 and deposit_at is not null and deposit_payment is not null)),
 check((status not in ('cancelled','no_show')) or (char_length(btrim(cancellation_reason)) between 3 and 300 and deposit_refunded=deposit_amount)),
 check(sale_id is null or status='finished')
);
create index salon_visits_schedule on public.salon_visits(business_id,practitioner_id,starts_at,busy_until) where status in ('scheduled','waiting','in_service');
create index salon_visits_history on public.salon_visits(business_id,starts_at,id);
create index salon_visits_customer on public.salon_visits(business_id,customer_id,starts_at desc);
alter table public.salon_settings enable row level security;
alter table public.salon_visits enable row level security;
revoke all on public.salon_settings,public.salon_visits from public,anon,authenticated;
grant select on public.salon_settings,public.salon_visits to authenticated;
grant all on public.salon_settings,public.salon_visits to service_role;
create policy salon_settings_read on public.salon_settings for select to authenticated using(public.has_salon_access(business_id));
create policy salon_visits_read on public.salon_visits for select to authenticated using(public.has_salon_access(business_id,array['owner','admin']) or (actor_id=auth.uid() and public.has_salon_access(business_id,array['cashier'])));
alter table public.salon_audit drop constraint salon_audit_resource_check;
alter table public.salon_audit add constraint salon_audit_resource_check check(resource in ('service','practitioner','visit','settings'));

create function public.salon_hours_cover(schedule jsonb,from_ts timestamptz,to_ts timestamptz) returns boolean
language plpgsql immutable set search_path='' as $$
declare day date; item jsonb; begins timestamptz; finishes timestamptz; covered timestamptz:=from_ts; names text[]:=array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
begin
 if schedule is null or not public.valid_business_hours(schedule) or from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts-from_ts>interval '14 hours' then return false; end if;
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
revoke all on function public.salon_hours_cover(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

create function public.save_salon_settings(target_id uuid,expected_revision integer,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.salon_settings;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_salon_access(target_id,array['owner']) then raise exception 'Salon settings access denied' using errcode='42501'; end if;
 select * into s from public.salon_settings where business_id=target_id;
 if expected_revision is null or expected_revision<>coalesce(s.revision,0) then raise exception 'Settings changed' using errcode='PT409'; end if;
 if details is null or jsonb_typeof(details)<>'object' or details-array['buffer','taxRate']<>'{}'::jsonb or coalesce(details->>'buffer','')!~'^(0|[1-9][0-9]{0,2})$' or (details->>'buffer')::integer>120 or coalesce(details->>'taxRate','')!~'^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$' or (details->>'taxRate')::numeric>100 then raise exception 'Invalid salon settings' using errcode='22023'; end if;
 insert into public.salon_settings as existing(business_id,buffer_minutes,tax_rate) values(target_id,(details->>'buffer')::integer,(details->>'taxRate')::numeric) on conflict(business_id) do update set buffer_minutes=excluded.buffer_minutes,tax_rate=excluded.tax_rate,revision=existing.revision+1 returning * into s;
 insert into public.salon_audit(business_id,actor_id,resource,resource_id,after_row) values(target_id,auth.uid(),'settings',target_id,to_jsonb(s));
 return to_jsonb(s);
end $$;
revoke all on function public.save_salon_settings(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_salon_settings(uuid,integer,jsonb) to authenticated;

create function public.salon_visit_operation(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,action text,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<salon_visit_operation>>
declare v public.salon_visits; before_row jsonb; prior public.salon_requests; payload jsonb; result jsonb; manage boolean; actor public.business_members;
 p public.salon_practitioners; s public.salon_services; config public.salon_settings; c public.customers; sale public.pos_transactions;
 ids uuid[]; service_key uuid; snapshot jsonb:='[]'; subtotal numeric:=0; duration integer:=0; starts timestamptz; finishes timestamptz; hold_until timestamptz; buffer integer;
 amount numeric; method text; discount_kind text; discount_value numeric; reduction numeric; tax numeric; total numeric; cash numeric; deposit numeric; payment_revision integer;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not found or not public.has_salon_access(target_id) then raise exception 'Salon access denied' using errcode='42501'; end if;
 manage:=public.has_salon_access(target_id,array['owner','admin']);
 select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
 if item_id is null or operation_id is null or action is null or action not in ('save','arrive','start','finish','deposit','cancel','no_show','pay') or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid salon request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','visit','id',item_id,'revision',expected_revision,'action',action,'details',details);
 select * into prior from public.salon_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
  select * into v from public.salon_visits where business_id=target_id and id=item_id;
  return to_jsonb(v);
 end if;
 select * into v from public.salon_visits where business_id=target_id and id=item_id for update;
 if found and not(manage or v.actor_id=auth.uid()) then raise exception 'Visit access denied' using errcode='42501'; end if;
 if (v.id is null and (action<>'save' or expected_revision is not null)) or (v.id is not null and (expected_revision is null or v.revision<>expected_revision)) then raise exception 'Visit changed' using errcode='PT409'; end if;
 before_row:=case when v.id is null then null else to_jsonb(v) end;
 select * into config from public.salon_settings where business_id=target_id;
 if action='save' then
  if v.id is not null and (v.status not in ('scheduled','waiting') or v.sale_id is not null) then raise exception 'Hanya kunjungan yang belum dilayani dapat diubah.' using errcode='P0001'; end if;
  if details-array['practitionerId','customerId','customer','phone','notes','kind','startsAt','serviceIds','deposit']<>'{}'::jsonb or coalesce(details->>'kind','') not in ('appointment','walk_in') or jsonb_typeof(details->'serviceIds') is distinct from 'array' or jsonb_array_length(details->'serviceIds') not between 1 and 20 or jsonb_typeof(details->'customer') is distinct from 'string' or char_length(btrim(details->>'customer')) not between 1 and 100 or jsonb_typeof(details->'phone') is distinct from 'string' or char_length(details->>'phone')>40 or jsonb_typeof(details->'notes') is distinct from 'string' or char_length(details->>'notes')>1000 then raise exception 'Invalid visit details' using errcode='22023'; end if;
  select array_agg(x::uuid order by ord) into ids from jsonb_array_elements_text(details->'serviceIds') with ordinality as q(x,ord);
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Layanan tidak boleh berulang.' using errcode='P0001'; end if;
  select * into p from public.salon_practitioners where business_id=target_id and id=(details->>'practitionerId')::uuid and active;
  if not found then raise exception 'Penata tidak aktif atau tidak tersedia.' using errcode='P0001'; end if;
  foreach service_key in array ids loop
   select * into s from public.salon_services where business_id=target_id and id=service_key and active;
   if not found then raise exception 'Layanan tidak aktif atau tidak tersedia.' using errcode='P0001'; end if;
   if not exists(select 1 from public.salon_practitioner_services where business_id=target_id and practitioner_id=p.id and service_id=s.id) then raise exception 'Penata tidak menangani semua layanan yang dipilih.' using errcode='P0001'; end if;
   subtotal:=subtotal+s.price;duration:=duration+s.duration_minutes;
   snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',s.id,'name',s.name,'sku','','unit','layanan','price',s.price,'quantity',1,'total',s.price,'duration',s.duration_minutes,'revision',s.revision));
  end loop;
  if duration>720 or subtotal>999999999999 then raise exception 'Maksimal 12 jam dan nominal melampaui batas kunjungan.' using errcode='22023'; end if;
  starts:=(details->>'startsAt')::timestamptz;
  if starts is null or not isfinite(starts) or (v.id is null or starts<>v.starts_at) and (starts<now()-interval '5 minutes' or starts>now()+interval '366 days') then raise exception 'Pilih jadwal mulai sekarang hingga 366 hari ke depan.' using errcode='P0001'; end if;
  if details->>'kind'='walk_in' and (v.id is null or starts<>v.starts_at) and starts>now()+interval '15 minutes' then raise exception 'Walk-in memakai waktu kedatangan saat ini; gunakan janji temu untuk jadwal mendatang.' using errcode='P0001'; end if;
  finishes:=starts+duration*interval '1 minute';buffer:=coalesce(config.buffer_minutes,0);hold_until:=finishes+buffer*interval '1 minute';
  if v.id is not null and starts=v.starts_at and p.id=v.practitioner_id and snapshot=v.lines then buffer:=v.buffer_minutes;hold_until:=finishes+buffer*interval '1 minute'; end if;
  if not public.salon_hours_cover((select operating_hours from public.businesses where id=target_id),starts,hold_until) then raise exception 'Slot dan jeda persiapan berada di luar jam operasional salon.' using errcode='P0001'; end if;
  if not public.salon_hours_cover(p.schedule,starts,hold_until) then raise exception 'Penata belum memiliki jadwal kerja atau slot berada di luar jadwalnya.' using errcode='P0001'; end if;
  if exists(select 1 from public.salon_visits x where x.business_id=target_id and x.practitioner_id=p.id and x.id<>item_id and x.status in ('scheduled','waiting','in_service') and x.starts_at<hold_until and x.busy_until>starts) or (details->>'kind'='walk_in' and exists(select 1 from public.salon_visits x where x.business_id=target_id and x.practitioner_id=p.id and x.id<>item_id and x.status='in_service')) then raise exception 'Penata sudah memiliki kunjungan pada slot tersebut.' using errcode='P0001'; end if;
  if nullif(details->>'customerId','') is not null then
   select * into c from public.customers where business_id=target_id and id=(details->>'customerId')::uuid and active;
   if not found then raise exception 'Pelanggan tidak aktif atau tidak tersedia.' using errcode='P0001'; end if;
  end if;
  if coalesce(v.deposit_amount,0)>subtotal then raise exception 'Tagihan lebih kecil dari DP. Batalkan dengan refund penuh sebelum mengubahnya.' using errcode='P0001'; end if;
  if v.id is null then
   insert into public.salon_visits(id,business_id,actor_id,actor_name,practitioner_id,practitioner_name,customer_id,customer,phone,notes,kind,starts_at,ends_at,buffer_minutes,busy_until,lines,subtotal,status,arrived_at)
   values(item_id,target_id,auth.uid(),actor.name,p.id,p.name,c.id,coalesce(c.name,btrim(details->>'customer')),coalesce(c.phone,public.normalize_customer_phone(details->>'phone')),details->>'notes',details->>'kind',starts,finishes,buffer,hold_until,snapshot,subtotal,case when details->>'kind'='walk_in' then 'waiting' else 'scheduled' end,case when details->>'kind'='walk_in' then now() else null end) returning * into v;
  else
   if details->'deposit' is not null and details->'deposit'<>'null'::jsonb then raise exception 'Catat DP melalui tindakan tersendiri saat mengubah kunjungan.' using errcode='22023'; end if;
   update public.salon_visits set practitioner_id=p.id,practitioner_name=p.name,customer_id=c.id,customer=coalesce(c.name,btrim(details->>'customer')),phone=coalesce(c.phone,public.normalize_customer_phone(details->>'phone')),notes=details->>'notes',kind=details->>'kind',starts_at=starts,ends_at=finishes,buffer_minutes=buffer,busy_until=hold_until,lines=snapshot,subtotal=salon_visit_operation.subtotal,revision=revision+1 where id=item_id returning * into v;
  end if;
  if details->'deposit' is not null and details->'deposit'<>'null'::jsonb then
   if jsonb_typeof(details->'deposit')<>'object' or (details->'deposit')-array['amount','payment','confirmed','paymentRevision']<>'{}'::jsonb or details->'deposit'->'confirmed' is distinct from 'true'::jsonb or coalesce(details->'deposit'->>'amount','')!~'^[1-9][0-9]{0,11}$' then raise exception 'Periksa nominal dan konfirmasi DP.' using errcode='22023'; end if;
   amount:=(details->'deposit'->>'amount')::numeric;
   if amount>v.subtotal then raise exception 'DP tidak boleh melebihi subtotal layanan.' using errcode='P0001'; end if;
   if coalesce(details->'deposit'->>'paymentRevision','')!~'^[0-9]{1,9}$' then raise exception 'Invalid payment revision' using errcode='22023'; end if;
   perform public.restaurant_payment_guard(target_id,details->'deposit'->>'payment',(details->'deposit'->>'paymentRevision')::integer);
   update public.salon_visits set deposit_amount=amount,deposit_payment=details->'deposit'->>'payment',deposit_at=now() where id=item_id returning * into v;
  end if;
 elsif action in ('arrive','start','finish') then
  if details<>'{}'::jsonb or v.sale_id is not null then raise exception 'Invalid visit transition' using errcode='22023'; end if;
  if action='arrive' then
   if v.status<>'scheduled' or now()>=v.ends_at then raise exception 'Kedatangan hanya untuk janji temu yang belum berakhir. Jadwalkan ulang jika terlambat.' using errcode='P0001'; end if;
   update public.salon_visits set status='waiting',arrived_at=now(),revision=revision+1 where id=item_id returning * into v;
  elsif action='start' then
   if v.status<>'waiting' or now()<v.starts_at or now()>=v.ends_at then raise exception 'Mulai pelayanan pada slot jadwalnya; ubah jadwal jika datang lebih awal atau terlambat.' using errcode='P0001'; end if;
   if exists(select 1 from public.salon_visits x where x.business_id=target_id and x.practitioner_id=v.practitioner_id and x.id<>v.id and x.status='in_service') then raise exception 'Penata masih melayani pelanggan lain. Selesaikan pelayanan sebelumnya dahulu.' using errcode='P0001'; end if;
   if not exists(select 1 from public.salon_practitioners where business_id=target_id and id=v.practitioner_id and active) then raise exception 'Penata sedang nonaktif.' using errcode='P0001'; end if;
   update public.salon_visits set status='in_service',started_at=now(),revision=revision+1 where id=item_id returning * into v;
  else
   if v.status<>'in_service' then raise exception 'Mulai pelayanan sebelum menandainya selesai.' using errcode='P0001'; end if;
   update public.salon_visits set status='finished',finished_at=now(),revision=revision+1 where id=item_id returning * into v;
  end if;
 elsif action='deposit' then
  if v.status not in ('scheduled','waiting','in_service') or v.deposit_amount>0 or v.sale_id is not null then raise exception 'DP sudah dicatat atau kunjungan tidak menerima DP.' using errcode='P0001'; end if;
  if details-array['amount','payment','confirmed','paymentRevision']<>'{}'::jsonb or details->'confirmed' is distinct from 'true'::jsonb or coalesce(details->>'amount','')!~'^[1-9][0-9]{0,11}$' then raise exception 'Periksa nominal dan konfirmasi DP.' using errcode='22023'; end if;
  amount:=(details->>'amount')::numeric;
  if amount>v.subtotal then raise exception 'DP tidak boleh melebihi subtotal layanan.' using errcode='P0001'; end if;
  if coalesce(details->>'paymentRevision','')!~'^[0-9]{1,9}$' then raise exception 'Invalid payment revision' using errcode='22023'; end if;
  perform public.restaurant_payment_guard(target_id,details->>'payment',(details->>'paymentRevision')::integer);
  update public.salon_visits set deposit_amount=amount,deposit_payment=details->>'payment',deposit_at=now(),revision=revision+1 where id=item_id returning * into v;
 elsif action in ('cancel','no_show') then
  if v.status not in ('scheduled','waiting','in_service','finished') or v.sale_id is not null then raise exception 'Kunjungan sudah ditutup atau dibayar.' using errcode='P0001'; end if;
  if details-array['reason','refundConfirmed']<>'{}'::jsonb or jsonb_typeof(details->'reason') is distinct from 'string' or char_length(btrim(details->>'reason')) not between 3 and 300 then raise exception 'Isi alasan pembatalan minimal 3 karakter.' using errcode='22023'; end if;
  if action='no_show' and (v.status<>'scheduled' or now()<v.starts_at+interval '15 minutes') then raise exception 'Tidak hadir hanya setelah terlambat 15 menit dan belum check-in.' using errcode='P0001'; end if;
  if v.deposit_amount>0 and (not manage or details->'refundConfirmed' is distinct from 'true'::jsonb) then raise exception 'DP harus dikembalikan penuh secara manual dan dikonfirmasi owner/admin.' using errcode='42501'; end if;
  update public.salon_visits set status=case when action='cancel' then 'cancelled' else 'no_show' end,cancellation_reason=btrim(details->>'reason'),deposit_refunded=deposit_amount,refunded_at=case when deposit_amount>0 then now() else null end,revision=revision+1 where id=item_id returning * into v;
 else
  if v.status<>'finished' or v.sale_id is not null then raise exception 'Selesaikan pelayanan sebelum menerima pelunasan.' using errcode='P0001'; end if;
  if details-array['payment','received','discountKind','discountValue','confirmed','paymentRevision','settingsRevision']<>'{}'::jsonb or details->'confirmed' is distinct from 'true'::jsonb or coalesce(details->>'received','')!~'^(0|[1-9][0-9]{0,11})$' or coalesce(details->>'discountKind','') not in ('none','amount','percent') or coalesce(details->>'discountValue','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' then raise exception 'Invalid salon payment' using errcode='22023'; end if;
  if coalesce(details->>'settingsRevision','')!~'^[0-9]{1,9}$' or coalesce(details->>'paymentRevision','')!~'^[0-9]{1,9}$' then raise exception 'Invalid settings revision' using errcode='22023'; end if;
  if (details->>'settingsRevision')::integer<>coalesce(config.revision,0) then raise exception 'Pengaturan pajak berubah. Muat ulang sebelum pembayaran.' using errcode='PT409'; end if;
  perform public.restaurant_payment_guard(target_id,details->>'payment',(details->>'paymentRevision')::integer);
  discount_kind:=details->>'discountKind';discount_value:=(details->>'discountValue')::numeric;method:=details->>'payment';cash:=(details->>'received')::numeric;
  if (discount_kind='none' and discount_value<>0) or (discount_kind='percent' and discount_value>100) or (discount_kind='amount' and discount_value<>trunc(discount_value)) then raise exception 'Invalid salon discount' using errcode='22023'; end if;
  if not manage and discount_kind<>'none' then raise exception 'Hanya owner/admin yang boleh memberi diskon.' using errcode='42501'; end if;
  reduction:=case discount_kind when 'amount' then discount_value when 'percent' then round(v.subtotal*discount_value/100,0) else 0 end;
  if reduction>v.subtotal then raise exception 'Diskon melebihi subtotal.' using errcode='22023'; end if;
  tax:=round((v.subtotal-reduction)*coalesce(config.tax_rate,0)/100,0);total:=v.subtotal-reduction+tax;deposit:=v.deposit_amount;
  if total>999999999999 or deposit>total or cash+deposit>999999999999 then raise exception 'Tagihan/DP melampaui batas. Periksa diskon dan DP.' using errcode='22023'; end if;
  if cash+deposit<total then raise exception 'Nominal pembayaran belum mencukupi sisa tagihan.' using errcode='P0001'; end if;
  if method<>'cash' and cash+deposit<>total then raise exception 'Pembayaran non-tunai harus sama dengan sisa tagihan.' using errcode='P0001'; end if;
  insert into public.pos_transactions(business_id,actor_id,actor_name,customer_id,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,deposit_amount,deposit_payment,balance_received,tax_rate,tax_amount,product_discount,order_discount)
  values(target_id,auth.uid(),actor.name,v.customer_id,v.customer,v.lines,v.subtotal,discount_kind,discount_value,reduction,total,method,cash+deposit,cash+deposit-total,deposit,v.deposit_payment,cash,coalesce(config.tax_rate,0),tax,0,reduction) returning * into sale;
  update public.salon_visits set sale_id=sale.id,revision=revision+1 where id=item_id returning * into v;
 end if;
 result:=to_jsonb(v);
 insert into public.salon_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 insert into public.salon_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'visit',item_id,before_row,result);
 return result;
end $$;
revoke all on function public.salon_visit_operation(uuid,uuid,integer,uuid,text,jsonb) from public,anon;
grant execute on function public.salon_visit_operation(uuid,uuid,integer,uuid,text,jsonb) to authenticated;

create function public.read_salon_visits(target_id uuid,from_ts timestamptz,to_ts timestamptz,page_number integer default 0,customer_key uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint; manage boolean;
begin
 if not public.has_salon_access(target_id) then raise exception 'Salon read access denied' using errcode='42501'; end if;
 manage:=public.has_salon_access(target_id,array['owner','admin']);
 if customer_key is not null and not manage then raise exception 'Customer history access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts-from_ts>interval '366 days' or page_number is null or page_number not between 0 and 100000 then raise exception 'Invalid salon filter' using errcode='22023'; end if;
 select count(*) into total from public.salon_visits v where v.business_id=target_id and v.starts_at<to_ts and v.ends_at>from_ts and (manage or v.actor_id=auth.uid()) and (customer_key is null or v.customer_id=customer_key);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at,q.id),'[]') into result from (select v.* from public.salon_visits v where v.business_id=target_id and v.starts_at<to_ts and v.ends_at>from_ts and (manage or v.actor_id=auth.uid()) and (customer_key is null or v.customer_id=customer_key) order by v.starts_at,v.id limit 50 offset page_number*50) q;
 return jsonb_build_object('items',result,'total',total,'page',page_number,'pageSize',50);
end $$;
revoke all on function public.read_salon_visits(uuid,timestamptz,timestamptz,integer,uuid) from public,anon;
grant execute on function public.read_salon_visits(uuid,timestamptz,timestamptz,integer,uuid) to authenticated;

create function public.salon_busy_slots(target_id uuid,from_ts timestamptz,to_ts timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_salon_access(target_id) then raise exception 'Salon access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts-from_ts>interval '7 days' then raise exception 'Invalid salon availability filter' using errcode='22023'; end if;
 if (select count(*) from public.salon_visits v where v.business_id=target_id and v.status in ('scheduled','waiting','in_service') and v.starts_at<to_ts and (v.busy_until>from_ts or v.status='in_service'))>5000 then raise exception 'Persempit rentang kalender.' using errcode='54000'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('practitioner_id',v.practitioner_id,'starts_at',v.starts_at,'ends_at',v.busy_until,'in_service',v.status='in_service') order by v.starts_at),'[]') into result from public.salon_visits v where v.business_id=target_id and v.status in ('scheduled','waiting','in_service') and v.starts_at<to_ts and (v.busy_until>from_ts or v.status='in_service');
 return result;
end $$;
revoke all on function public.salon_busy_slots(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.salon_busy_slots(uuid,timestamptz,timestamptz) to authenticated;

create function public.cancel_salon_sale(target_id uuid,sale_id uuid,explanation text,goods_returned boolean,refund_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sale public.pos_transactions; v public.salon_visits; actor text;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_salon_access(target_id,array['owner','admin']) then raise exception 'Salon refund access denied' using errcode='42501'; end if;
 select * into v from public.salon_visits where business_id=target_id and salon_visits.sale_id=cancel_salon_sale.sale_id for update;
 if not found then raise exception 'Sale access denied' using errcode='42501'; end if;
 select * into sale from public.pos_transactions where business_id=target_id and id=cancel_salon_sale.sale_id for update;
 if sale.status='cancelled' then return to_jsonb(sale); end if;
 if explanation is null or char_length(btrim(explanation)) not between 3 and 300 or goods_returned is distinct from true or refund_confirmed is distinct from true then raise exception 'Confirm salon cancellation and full manual refund' using errcode='22023'; end if;
 select name into actor from public.business_members where business_id=target_id and user_id=auth.uid();
 update public.pos_transactions set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancelled_by_name=actor,cancellation_reason=btrim(explanation),refund_amount=total where id=sale.id returning * into sale;
 insert into public.salon_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'visit',v.id,to_jsonb(v),to_jsonb(v)||jsonb_build_object('refunded_sale',sale.id));
 return to_jsonb(sale);
end $$;
revoke all on function public.cancel_salon_sale(uuid,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.cancel_salon_sale(uuid,uuid,text,boolean,boolean) to authenticated;

create function public.salon_report_summary(target_id uuid,from_ts timestamptz,to_ts timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_salon_access(target_id,array['owner','admin']) then raise exception 'Salon report access denied' using errcode='42501'; end if;
 if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts) or to_ts<=from_ts or to_ts-from_ts>interval '366 days' then raise exception 'Invalid salon report filter' using errcode='22023'; end if;
 select jsonb_build_object('scheduled',count(*) filter(where status='scheduled'),'waiting',count(*) filter(where status='waiting'),'in_service',count(*) filter(where status='in_service'),'finished',count(*) filter(where status='finished'),'cancelled',count(*) filter(where status='cancelled'),'no_show',count(*) filter(where status='no_show')) into result from public.salon_visits where business_id=target_id and starts_at>=from_ts and starts_at<to_ts;
 return result||jsonb_build_object('deposits',(select coalesce(sum(deposit_amount),0) from public.salon_visits where business_id=target_id and deposit_at>=from_ts and deposit_at<to_ts),'depositRefunds',(select coalesce(sum(deposit_refunded),0) from public.salon_visits where business_id=target_id and refunded_at>=from_ts and refunded_at<to_ts),'practitioners',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select v.practitioner_id,min(v.practitioner_name) as name,count(*) as visits,coalesce(sum(t.total-t.tax_amount),0) as revenue from public.salon_visits v join public.pos_transactions t on t.id=v.sale_id and t.business_id=target_id where v.business_id=target_id and t.status='completed' and t.created_at>=from_ts and t.created_at<to_ts group by v.practitioner_id order by revenue desc,v.practitioner_id) q));
end $$;
revoke all on function public.salon_report_summary(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.salon_report_summary(uuid,timestamptz,timestamptz) to authenticated;

do $migration$
declare signature text; body text; changed text;
begin
 foreach signature in array array['save_customer(uuid,uuid,integer,uuid,jsonb)','read_sales_report(uuid,timestamptz,timestamptz,text)','reserve_payment_qr(uuid,uuid)'] loop
  if to_regprocedure('public.'||signature) is null then raise exception 'Required function missing: %',signature; end if;
  body:=pg_get_functiondef(to_regprocedure('public.'||signature));changed:=body;
  if signature like 'save_customer%' then
   changed:=replace(changed,'category=''store''','category in (''store'',''barbershop'')');
  else
   changed:=replace(changed,'category in (''store'',''restaurant'')','category in (''store'',''restaurant'',''barbershop'')');
  end if;
  if changed=body then raise exception 'Unexpected category guard: %',signature; end if;
  execute changed;
 end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
