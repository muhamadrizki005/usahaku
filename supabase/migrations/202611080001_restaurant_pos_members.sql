begin;

alter table public.restaurant_tables add column deleted_at timestamptz;
drop index public.restaurant_table_name;
create unique index restaurant_table_name on public.restaurant_tables(business_id,lower(name)) where deleted_at is null;
alter table public.restaurant_orders add column customer_id uuid;
alter table public.restaurant_orders add foreign key(business_id,customer_id) references public.customers(business_id,id);
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.restaurant_orders'::regclass and contype='c' and pg_get_constraintdef(oid) like '%table_name%' and pg_get_constraintdef(oid) like '%kind%' loop
  execute format('alter table public.restaurant_orders drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.restaurant_orders add constraint restaurant_order_optional_table check(
 (kind='dine_in' and ((table_id is null and table_name is null) or (table_id is not null and table_name is not null))) or
 (kind='takeaway' and table_id is null and table_name is null));

alter table public.restaurant_billing_settings
 add column loyalty_active boolean not null default false,
 add column earn_nominal numeric not null default 10000 check(earn_nominal between 1 and 1000000000 and earn_nominal=trunc(earn_nominal)),
 add column redemption_active boolean not null default false,
 add column point_value numeric not null default 0 check(point_value between 0 and 1000000000 and point_value=trunc(point_value)),
 add constraint restaurant_redemption_value check(not redemption_active or point_value>=1);
alter table public.pos_transactions
 add column points_redeemed bigint not null default 0 check(points_redeemed between 0 and 9007199254740991),
 add column point_discount numeric not null default 0 check(point_discount between 0 and 999999999999 and point_discount=trunc(point_discount));
alter table public.customer_point_history drop constraint customer_point_history_kind_check;
alter table public.customer_point_history add constraint customer_point_history_kind_check check(kind in ('earn','refund','adjustment','redeem'));

create function public.save_restaurant_loyalty(target_id uuid,expected_revision integer,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.restaurant_billing_settings;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id,array['owner'],true) then raise exception 'Owner access required' using errcode='42501'; end if;
 select * into b from public.restaurant_billing_settings where business_id=target_id;
 if expected_revision is null or expected_revision<>coalesce(b.revision,0) then raise exception 'Billing changed; reload' using errcode='PT409'; end if;
 if details is null or jsonb_typeof(details)<>'object' or details-array['active','nominal','redemption','pointValue']<>'{}'::jsonb
 or jsonb_typeof(details->'active') is distinct from 'boolean' or jsonb_typeof(details->'redemption') is distinct from 'boolean'
 or coalesce(details->>'nominal','') !~ '^[1-9][0-9]{0,9}$' or (details->>'nominal')::numeric>1000000000
 or coalesce(details->>'pointValue','') !~ '^(0|[1-9][0-9]{0,9})$' or (details->>'pointValue')::numeric>1000000000
 or ((details->>'redemption')::boolean and (details->>'pointValue')::numeric<1) then raise exception 'Invalid loyalty configuration' using errcode='22023'; end if;
 insert into public.restaurant_billing_settings(business_id,loyalty_active,earn_nominal,redemption_active,point_value)
 values(target_id,(details->>'active')::boolean,(details->>'nominal')::numeric,(details->>'redemption')::boolean,(details->>'pointValue')::numeric)
 on conflict(business_id) do update set loyalty_active=excluded.loyalty_active,earn_nominal=excluded.earn_nominal,redemption_active=excluded.redemption_active,point_value=excluded.point_value,revision=restaurant_billing_settings.revision+1,updated_at=now() returning * into b;
 return to_jsonb(b);
end $$;
revoke all on function public.save_restaurant_loyalty(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_restaurant_loyalty(uuid,integer,jsonb) to authenticated;

create function public.delete_restaurant_table(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.restaurant_tables; prior public.restaurant_requests; payload jsonb; result jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id,array['owner','admin']) then raise exception 'Table deletion access denied' using errcode='42501'; end if;
 if item_id is null or operation_id is null or expected_revision is null then raise exception 'Invalid request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource','delete_table','id',item_id,'revision',expected_revision);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 select * into t from public.restaurant_tables where id=item_id and business_id=target_id for update;
 if not found or t.deleted_at is not null or t.revision<>expected_revision then raise exception 'Table changed; reload' using errcode='PT409'; end if;
 if exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=item_id and status='open')
 or exists(select 1 from public.restaurant_reservations where business_id=target_id and table_id=item_id and status in ('reserved','seated')) then
  raise exception 'Meja masih memiliki pesanan atau reservasi aktif. Selesaikan atau pindahkan terlebih dahulu.' using errcode='P0001'; end if;
 update public.restaurant_tables set active=false,deleted_at=now(),revision=revision+1 where id=item_id returning * into t;
 result:=to_jsonb(t);
 insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'table',item_id,null,result);
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.delete_restaurant_table(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.delete_restaurant_table(uuid,uuid,integer,uuid) to authenticated;

create function public.protect_deleted_restaurant_table() returns trigger language plpgsql set search_path='' as $$
begin if old.deleted_at is not null then raise exception 'Table was deleted' using errcode='PT409'; end if; return new; end $$;
create trigger restaurant_deleted_table before update on public.restaurant_tables for each row execute function public.protect_deleted_restaurant_table();
revoke all on function public.protect_deleted_restaurant_table() from public,anon,authenticated;

create function pg_temp.patch_restaurant_function(signature regprocedure,needle text,replacement text) returns void language plpgsql as $$
declare body text:=pg_get_functiondef(signature);
begin
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unexpected function body: %, inspect before applying',signature; end if;
 execute replace(body,needle,replacement);
end $$;

select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 'result jsonb;', 'result jsonb; selected public.customers;');
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 $n$array['kind','tableId','guests','customer','notes','stage','lines']$n$,
 $r$array['kind','tableId','guests','customer','customerId','notes','stage','lines']$r$);
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 $n$if details->>'kind'='dine_in' then$n$,
 $r$if details->>'kind'='dine_in' and details->>'tableId' is not null then$r$);
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 $n$elsif details->'tableId' is distinct from 'null'::jsonb$n$,
 $r$elsif details->>'tableId' is not null$r$);
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 $n$if (select count(distinct value->>'id')$n$,
 $r$if not(details?'customerId') and o.customer_id is not null then details:=details||jsonb_build_object('customerId',o.customer_id); end if;
  if details->>'customerId' is not null then
   select * into selected from public.customers where business_id=target_id and id=(details->>'customerId')::uuid and active for update;
   if not found then raise exception 'Member tidak aktif atau tidak ditemukan.' using errcode='P0001'; end if;
   details:=jsonb_set(details,'{customer}',to_jsonb(selected.name));
  end if;
  if (select count(distinct value->>'id')$r$);
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 'subtotal,occupies_table)', 'subtotal,occupies_table,customer_id)');
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 'snapshot,order_subtotal,physical)', 'snapshot,order_subtotal,physical,selected.id)');
select pg_temp.patch_restaurant_function('public.save_restaurant_order_core_v2(uuid,uuid,integer,uuid,jsonb,boolean)',
 $n$customer=trim(details->>'customer'),notes=$n$, $r$customer_id=selected.id,customer=trim(details->>'customer'),notes=$r$);

select pg_temp.patch_restaurant_function('public.save_customer(uuid,uuid,integer,uuid,jsonb)',
 $n$category in ('store','barbershop')$n$, $r$category in ('store','restaurant','barbershop')$r$);

select pg_temp.patch_restaurant_function('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'net numeric;', 'net numeric; member_row public.customers; redeemed bigint:=0; earned bigint:=0; point_cut numeric:=0; before_pts bigint;');
select pg_temp.patch_restaurant_function('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 $n$array['payment','received','discountKind','discountValue','confirmed','paymentRevision','billingRevision']$n$,
 $r$array['payment','received','discountKind','discountValue','confirmed','paymentRevision','billingRevision','redeemPoints']$r$);
select pg_temp.patch_restaurant_function('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'net:=o.subtotal-discount;',
 $r$if coalesce(details->>'redeemPoints','0') !~ '^(0|[1-9][0-9]{0,15})$' or coalesce((details->>'redeemPoints')::numeric,0)>9007199254740991 then raise exception 'Nominal poin tidak valid.' using errcode='P0001'; end if;
  redeemed:=coalesce((details->>'redeemPoints')::bigint,0);
  if o.customer_id is not null then
   select * into member_row from public.customers where business_id=target_id and id=o.customer_id and active for update;
   if not found then raise exception 'Member tidak aktif atau tidak ditemukan.' using errcode='P0001'; end if;
  end if;
  if redeemed>0 then
   if member_row.id is null or not coalesce(billing.redemption_active,false) or coalesce(billing.point_value,0)<1 then raise exception 'Penukaran poin belum aktif atau member belum dipilih.' using errcode='P0001'; end if;
   if redeemed>member_row.points then raise exception 'Saldo poin tidak cukup. Muat ulang member.' using errcode='P0001'; end if;
   point_cut:=redeemed::numeric*billing.point_value;
   if point_cut>o.subtotal-discount then raise exception 'Potongan poin melebihi subtotal setelah diskon.' using errcode='P0001'; end if;
  end if;
  discount:=discount+point_cut;
  net:=o.subtotal-discount;$r$);
select pg_temp.patch_restaurant_function('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'insert into public.pos_transactions(',
 $r$if member_row.id is not null and coalesce(billing.loyalty_active,false) then earned:=floor(total/billing.earn_nominal)::bigint; end if;
  if member_row.id is not null and member_row.points-redeemed+earned>9007199254740991 then raise exception 'Saldo poin melampaui batas.' using errcode='P0001'; end if;
  insert into public.pos_transactions($r$);
select pg_temp.patch_restaurant_function('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'tax_base,billing_revision)', 'tax_base,billing_revision,customer_id,points_earned,points_redeemed,point_discount)');
select pg_temp.patch_restaurant_function('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'coalesce(billing.revision,0)) returning * into sale;',
 $r$coalesce(billing.revision,0),member_row.id,earned,redeemed,point_cut) returning * into sale;
  if member_row.id is not null then
   before_pts:=member_row.points;
   if redeemed>0 then
    insert into public.customer_point_history(business_id,customer_id,sale_id,kind,points,before_points,after_points,description,actor_id,actor_name) values(target_id,member_row.id,sale.id,'redeem',-redeemed,before_pts,before_pts-redeemed,'Penukaran poin restoran',auth.uid(),actor.name);
    before_pts:=before_pts-redeemed;
   end if;
   if earned>0 then insert into public.customer_point_history(business_id,customer_id,sale_id,kind,points,before_points,after_points,description,actor_id,actor_name) values(target_id,member_row.id,sale.id,'earn',earned,before_pts,before_pts+earned,'Pembayaran restoran',auth.uid(),actor.name); end if;
   update public.customers set points=before_pts+earned,updated_at=now() where id=member_row.id and business_id=target_id;
  end if;$r$);
select pg_temp.patch_restaurant_function('public.cancel_restaurant_sale(uuid,uuid,text,boolean,boolean)',
 'old_row jsonb;', 'old_row jsonb; member_row public.customers; reversed bigint;');
select pg_temp.patch_restaurant_function('public.cancel_restaurant_sale(uuid,uuid,text,boolean,boolean)',
 'old_row:=to_jsonb(o);',
 $r$old_row:=to_jsonb(o);
  if sale.customer_id is not null then
   select * into member_row from public.customers where business_id=target_id and id=sale.customer_id for update;
   if found then
    reversed:=least(member_row.points,sale.points_earned);
    if member_row.points-reversed+sale.points_redeemed>9007199254740991 then raise exception 'Saldo poin melampaui batas.' using errcode='P0001'; end if;
    update public.customers set points=member_row.points-reversed+sale.points_redeemed,updated_at=now() where business_id=target_id and id=member_row.id;
    if reversed<>0 or sale.points_redeemed<>0 then insert into public.customer_point_history(business_id,customer_id,sale_id,kind,points,before_points,after_points,description,actor_id,actor_name) values(target_id,member_row.id,sale.id,'refund',sale.points_redeemed-reversed,member_row.points,member_row.points-reversed+sale.points_redeemed,'Pembatalan restoran: '||trim(explanation),auth.uid(),actor); end if;
   end if;
  end if;$r$);

commit;
