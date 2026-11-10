begin;

create function public.read_restaurant_member(target_id uuid,customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_restaurant_access(target_id) then raise exception 'Member access denied' using errcode='42501'; end if;
 select jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'points',c.points) into result
 from public.customers c where c.business_id=target_id and c.id=customer_id and c.active;
 if result is null then raise exception 'Member tidak aktif atau tidak ditemukan.' using errcode='P0001'; end if;
 return result;
end $$;
revoke all on function public.read_restaurant_member(uuid,uuid) from public,anon;
grant execute on function public.read_restaurant_member(uuid,uuid) to authenticated;

create function public.save_restaurant_followup(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb,source_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.restaurant_orders; prior public.restaurant_requests;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Order access denied' using errcode='42501'; end if;
 select * into original from public.restaurant_orders where business_id=target_id and id=source_id;
 if not found or original.status<>'paid' or not(public.has_restaurant_access(target_id,array['owner','admin']) or original.actor_id=auth.uid()) then
  raise exception 'Follow-up access denied' using errcode='42501'; end if;
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() then raise exception 'Request access denied' using errcode='42501'; end if;
  return public.save_restaurant_order(target_id,item_id,expected_revision,operation_id,details);
 end if;
 if expected_revision is not null then raise exception 'Follow-up must be a new order' using errcode='22023'; end if;
 if original.table_id is not null and details->>'tableId'=original.table_id::text
 and not exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=original.table_id and status='open') then
  update public.restaurant_tables set occupied_until_released=false where business_id=target_id and id=original.table_id;
 end if;
 return public.save_restaurant_order(target_id,item_id,expected_revision,operation_id,details);
end $$;
revoke all on function public.save_restaurant_followup(uuid,uuid,integer,uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_restaurant_followup(uuid,uuid,integer,uuid,jsonb,uuid) to authenticated;

create function public.checkout_restaurant_cart(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,order_details jsonb,payment_details jsonb,quoted_subtotal numeric,source_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.restaurant_requests; payload jsonb; saved jsonb; result jsonb;
 order_request uuid:=md5(operation_id::text||':order')::uuid; payment_request uuid:=md5(operation_id::text||':payment')::uuid;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not public.has_restaurant_access(target_id) then raise exception 'Checkout access denied' using errcode='42501'; end if;
 if operation_id is null or item_id is null or quoted_subtotal is null or quoted_subtotal<0 then raise exception 'Invalid checkout request' using errcode='22023'; end if;
 payload:=jsonb_build_object('action','cart_checkout','id',item_id,'revision',expected_revision,'order',order_details,'payment',payment_details,'subtotal',quoted_subtotal,'source',source_id);
 select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 saved:=case when source_id is null then public.save_restaurant_order(target_id,item_id,expected_revision,order_request,order_details)
 else public.save_restaurant_followup(target_id,item_id,expected_revision,order_request,order_details,source_id) end;
 if (saved->>'subtotal')::numeric<>quoted_subtotal then raise exception 'Harga menu berubah. Muat ulang dan periksa tagihan sebelum membayar.' using errcode='PT409'; end if;
 result:=public.pay_restaurant_order(target_id,item_id,(saved->>'revision')::integer,payment_request,payment_details);
 insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.checkout_restaurant_cart(uuid,uuid,integer,uuid,jsonb,jsonb,numeric,uuid) from public,anon;
grant execute on function public.checkout_restaurant_cart(uuid,uuid,integer,uuid,jsonb,jsonb,numeric,uuid) to authenticated;

create function pg_temp.patch_restaurant_checkout(signature regprocedure,needle text,replacement text) returns void language plpgsql as $$
declare body text:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
begin
 needle:=replace(needle,E'\r\n',E'\n'); replacement:=replace(replacement,E'\r\n',E'\n');
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unexpected function body %, marker %',signature,left(needle,80); end if;
 execute replace(body,needle,replacement);
end $$;
select pg_temp.patch_restaurant_checkout('public.save_restaurant_loyalty(uuid,integer,jsonb)',
 'return to_jsonb(b);',
 $r$update public.businesses set loyalty_active=b.loyalty_active,loyalty_point_nominal=b.earn_nominal where id=target_id;
 return to_jsonb(b);$r$);
select pg_temp.patch_restaurant_checkout('public.save_business_loyalty_settings(uuid,boolean,numeric,jsonb)',
 'and id=(r->>''product_id'')::uuid and active) then',
 $r$and id=(r->>'product_id')::uuid and active)
    and not exists(select 1 from public.restaurant_menu where business_id=target_id and id=(r->>'product_id')::uuid and active) then$r$);
select pg_temp.patch_restaurant_checkout('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'net numeric;', 'net numeric; loyalty_business public.businesses; reward jsonb; reward_line jsonb;');
select pg_temp.patch_restaurant_checkout('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 $n$array['payment','received','discountKind','discountValue','confirmed','paymentRevision','billingRevision','redeemPoints']$n$,
 $r$array['payment','received','discountKind','discountValue','confirmed','paymentRevision','billingRevision','redeemPoints','redemptionId']$r$);
select pg_temp.patch_restaurant_checkout('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 $n$if redeemed>0 then
   if member_row.id is null$n$,
 $r$select * into loyalty_business from public.businesses where id=target_id;
  if details?'redemptionId' then
   if member_row.id is null or not loyalty_business.loyalty_active or redeemed<1 then raise exception 'Pilih member aktif dan hadiah poin yang tersedia.' using errcode='P0001'; end if;
   if (select count(*) from jsonb_array_elements(loyalty_business.loyalty_redemptions) as reward_item(value) where reward_item.value->>'id'=details->>'redemptionId')<>1 then raise exception 'Hadiah poin berubah. Muat ulang dan pilih kembali voucher.' using errcode='PT409'; end if;
   select value into reward from jsonb_array_elements(loyalty_business.loyalty_redemptions) where value->>'id'=details->>'redemptionId';
   if (reward->>'points_required')::numeric<>redeemed or redeemed>member_row.points then raise exception 'Saldo atau jumlah poin hadiah berubah. Muat ulang member.' using errcode='PT409'; end if;
   if reward->>'reward_type'='voucher' then
    if coalesce(reward->>'voucher_amount','')!~'^[1-9][0-9]{0,11}$' then raise exception 'Nominal voucher tidak valid.' using errcode='22023'; end if;
    point_cut:=least(o.subtotal-discount,(reward->>'voucher_amount')::numeric);
   elsif reward->>'reward_type'='product' then
    select value into reward_line from jsonb_array_elements(o.lines) where value->>'id'=reward->>'product_id';
    if not found then raise exception 'Tambahkan menu hadiah ke keranjang.' using errcode='22023'; end if;
    point_cut:=least(o.subtotal-discount,(reward_line->>'price')::numeric);
   else raise exception 'Hadiah tidak berlaku untuk restoran.' using errcode='22023'; end if;
   if point_cut<=0 then raise exception 'Hadiah tidak berlaku untuk tagihan nol.' using errcode='22023'; end if;
  elsif redeemed>0 then
   if member_row.id is null$r$);
select pg_temp.patch_restaurant_checkout('public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb)',
 'if member_row.id is not null and coalesce(billing.loyalty_active,false) then earned:=floor(total/billing.earn_nominal)::bigint; end if;',
 'if member_row.id is not null and coalesce(loyalty_business.loyalty_active,false) then earned:=floor(total/loyalty_business.loyalty_point_nominal)::bigint; end if;');
notify pgrst,'reload schema';
commit;
