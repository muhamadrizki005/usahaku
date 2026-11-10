begin;

alter table public.businesses add column if not exists loyalty_redemptions jsonb not null default '[]'::jsonb;
alter table public.pos_transactions drop constraint pos_discount_breakdown;
alter table public.pos_transactions add constraint pos_discount_breakdown check (
 (product_discount is null and order_discount is null) or
 (product_discount is not null and order_discount is not null and product_discount>=0 and order_discount>=0 and discount=product_discount+order_discount+point_discount));

drop function if exists public.save_business_loyalty_settings(uuid,boolean,numeric,jsonb);
create function public.save_business_loyalty_settings(target_id uuid,new_active boolean,new_nominal numeric,new_redemptions jsonb)
returns public.businesses language plpgsql security definer set search_path='' as $$
declare b public.businesses; r jsonb;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not found or not public.has_business_access(target_id,array['owner']) then raise exception 'Loyalty settings access denied' using errcode='42501'; end if;
 if new_active is null or new_nominal is null or new_nominal not between 1 and 1000000000 or new_nominal<>trunc(new_nominal)
 or new_redemptions is null or jsonb_typeof(new_redemptions)<>'array' or jsonb_array_length(new_redemptions)>100 then
  raise exception 'Invalid loyalty configuration' using errcode='22023'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(new_redemptions))<>jsonb_array_length(new_redemptions) then
  raise exception 'Duplicate loyalty reward' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(new_redemptions) loop
  if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'id') is distinct from 'string' or char_length(coalesce(r->>'id','')) not between 1 and 200
  or jsonb_typeof(r->'points_required') is distinct from 'number' or coalesce(r->>'points_required','')!~'^[1-9][0-9]{0,6}$'
  or (r->>'points_required')::numeric>1000000 or coalesce(r->>'reward_type','') not in ('voucher','product','service') then
   raise exception 'Invalid loyalty reward' using errcode='22023'; end if;
  if r->>'reward_type'='voucher' then
   if jsonb_typeof(r->'voucher_amount') is distinct from 'number' or coalesce(r->>'voucher_amount','')!~'^[1-9][0-9]{0,11}$' then
    raise exception 'Invalid voucher amount' using errcode='22023'; end if;
  elsif r->>'reward_type'='product' then
   if not exists(select 1 from public.catalog_products where business_id=target_id and id=(r->>'product_id')::uuid and active) then
    raise exception 'Reward product unavailable' using errcode='22023'; end if;
  elsif not exists(select 1 from public.salon_services where business_id=target_id and id=(r->>'service_id')::uuid and active) then
   raise exception 'Reward service unavailable' using errcode='22023';
  end if;
 end loop;
 update public.businesses set loyalty_active=new_active,loyalty_point_nominal=new_nominal,loyalty_redemptions=new_redemptions where id=target_id returning * into b;
 return b;
end $$;
revoke all on function public.save_business_loyalty_settings(uuid,boolean,numeric,jsonb) from public,anon;
grant execute on function public.save_business_loyalty_settings(uuid,boolean,numeric,jsonb) to authenticated;

create function pg_temp.patch_store_points(signature regprocedure,needle text,replacement text) returns void language plpgsql as $$
declare body text:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
begin
 needle:=replace(needle,E'\r\n',E'\n');
 replacement:=replace(replacement,E'\r\n',E'\n');
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unexpected function body: %, inspect before applying',signature; end if;
 execute replace(body,needle,replacement);
end $$;

select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 'earned_points bigint := 0;',
 'redeemed_points bigint:=0; point_cut numeric:=0; reward jsonb; reward_line jsonb; earned_points bigint := 0;');
select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 $n$array['lines','payment','received','discountKind','discountValue','customer','confirmed','customerId','taxRate','taxRevision','paymentRevision']$n$,
 $r$array['lines','payment','received','discountKind','discountValue','customer','confirmed','customerId','taxRate','taxRevision','paymentRevision','redemptionId','pointsRedeemed']$r$);
select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 'where id=selected_id and business_id=target_id and active;',
 'where id=selected_id and business_id=target_id and active for update;');
select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 'tax:=round(net*settings.tax_rate/100,0); total:=net+tax;',
 $r$if details?'pointsRedeemed' and (jsonb_typeof(details->'pointsRedeemed') is distinct from 'number' or coalesce(details->>'pointsRedeemed','')!~'^(0|[1-9][0-9]{0,6})$' or (details->>'pointsRedeemed')::numeric>1000000) then
   raise exception 'Nominal poin tidak valid.' using errcode='22023'; end if;
  redeemed_points:=coalesce((details->>'pointsRedeemed')::bigint,0);
  if redeemed_points>0 or details?'redemptionId' then
   if redeemed_points<1 or selected_id is null or not coalesce(settings.loyalty_active,false) then raise exception 'Pilih member aktif dan aktifkan program poin sebelum menukar.' using errcode='22023'; end if;
   if (select count(*) from jsonb_array_elements(settings.loyalty_redemptions) r where r->>'id'=details->>'redemptionId')<>1 then
    raise exception 'Hadiah belum tersimpan atau sudah berubah. Minta owner menyimpan ulang aturan poin, lalu muat ulang kasir.' using errcode='PT409'; end if;
   select value into reward from jsonb_array_elements(settings.loyalty_redemptions) where value->>'id'=details->>'redemptionId';
   if jsonb_typeof(reward->'points_required') is distinct from 'number' or coalesce(reward->>'points_required','')!~'^[1-9][0-9]{0,6}$'
    or (reward->>'points_required')::numeric<>redeemed_points then raise exception 'Jumlah poin hadiah berubah. Muat ulang kasir dan pilih kembali hadiah.' using errcode='PT409'; end if;
   if selected_customer.points<redeemed_points then raise exception 'Saldo poin member tidak cukup. Muat ulang member.' using errcode='PT409'; end if;
   if reward->>'reward_type'='voucher' then
    if jsonb_typeof(reward->'voucher_amount') is distinct from 'number' or coalesce(reward->>'voucher_amount','')!~'^[1-9][0-9]{0,11}$' then raise exception 'Nominal voucher poin tidak valid.' using errcode='22023'; end if;
    point_cut:=least(net,(reward->>'voucher_amount')::numeric);
   elsif reward->>'reward_type'='product' then
    select value into reward_line from jsonb_array_elements(snapshot) where value->>'id'=reward->>'product_id';
    if not found then raise exception 'Tambahkan produk hadiah ke keranjang sebelum menukar poin.' using errcode='22023'; end if;
    point_cut:=least(net,round((reward_line->>'unit_price')::numeric*least(1,(reward_line->>'quantity')::numeric),0));
   else raise exception 'Hadiah ini tidak berlaku untuk kasir toko.' using errcode='22023'; end if;
   if point_cut<=0 then raise exception 'Hadiah tidak dapat dipakai pada tagihan nol.' using errcode='22023'; end if;
   discount:=discount+point_cut; net:=net-point_cut;
  end if;
  tax:=round(net*settings.tax_rate/100,0); total:=net+tax;$r$);
select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 'order_discount,points_earned)', 'order_discount,points_earned,points_redeemed,point_discount)');
select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 'order_discount,earned_points) returning * into sale;', 'order_discount,earned_points,redeemed_points,point_cut) returning * into sale;');
select pg_temp.patch_store_points('public.checkout_pos(uuid,uuid,jsonb)',
 $n$if selected_id is not null and earned_points > 0 then
    select points into before_pts from public.customers where id = selected_id for update;
    after_pts := before_pts + earned_points;
    if after_pts>9007199254740991 then raise exception 'Loyalty balance exceeds supported limit' using errcode='22023'; end if;
    update public.customers set points = after_pts, updated_at = now() where id = selected_id;
    insert into public.customer_point_history(business_id, customer_id, sale_id, kind, points, before_points, after_points, description, actor_id, actor_name)
      values(target_id, selected_id, sale.id, 'earn', earned_points, before_pts, after_pts, 'Transaksi POS ' || sale.id::text, auth.uid(), actor.name);
  end if;$n$,
 $r$if selected_id is not null and (earned_points>0 or redeemed_points>0) then
    select points into before_pts from public.customers where id=selected_id and business_id=target_id for update;
    if redeemed_points>0 then
     insert into public.customer_point_history(business_id,customer_id,sale_id,kind,points,before_points,after_points,description,actor_id,actor_name)
     values(target_id,selected_id,sale.id,'redeem',-redeemed_points,before_pts,before_pts-redeemed_points,'Penukaran hadiah '||(reward->>'id'),auth.uid(),actor.name);
     before_pts:=before_pts-redeemed_points;
    end if;
    after_pts:=before_pts+earned_points;
    if after_pts>9007199254740991 then raise exception 'Loyalty balance exceeds supported limit' using errcode='22023'; end if;
    update public.customers set points=after_pts,updated_at=now() where id=selected_id and business_id=target_id;
    if earned_points>0 then
     insert into public.customer_point_history(business_id,customer_id,sale_id,kind,points,before_points,after_points,description,actor_id,actor_name)
     values(target_id,selected_id,sale.id,'earn',earned_points,before_pts,after_pts,'Transaksi POS '||sale.id::text,auth.uid(),actor.name);
    end if;
  end if;$r$);

select pg_temp.patch_store_points('public.cancel_pos(uuid,uuid,text,boolean,boolean)',
 'if sale.customer_id is not null and coalesce(sale.points_earned, 0) > 0 then',
 'if sale.customer_id is not null and (coalesce(sale.points_earned,0)>0 or coalesce(sale.points_redeemed,0)>0) then');
select pg_temp.patch_store_points('public.cancel_pos(uuid,uuid,text,boolean,boolean)',
 'after_pts := cust_pts - deduct_pts;',
 $r$after_pts:=cust_pts-deduct_pts+coalesce(sale.points_redeemed,0);
      if after_pts>9007199254740991 then raise exception 'Loyalty balance exceeds supported limit' using errcode='22023'; end if;$r$);
select pg_temp.patch_store_points('public.cancel_pos(uuid,uuid,text,boolean,boolean)',
 $n$sale.id, 'refund', -deduct_pts, cust_pts, after_pts,$n$, $r$sale.id, 'refund', coalesce(sale.points_redeemed,0)-deduct_pts, cust_pts, after_pts,$r$);

notify pgrst,'reload schema';
commit;
