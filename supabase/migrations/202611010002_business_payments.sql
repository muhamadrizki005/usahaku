begin;
create table public.business_payment_assets (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  path text unique not null,
  state text not null default 'staging' check(state in ('staging','active','retired','deleting','deleted')),
  created_at timestamptz not null default now(),
  check(path=business_id::text||'/'||id::text||'.png'),
  unique(business_id,id)
);
create table public.business_payments (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  cash boolean not null, qris boolean not null, transfer boolean not null,
  banks jsonb not null default '[]' check(jsonb_typeof(banks)='array' and jsonb_array_length(banks)<=10),
  qris_asset uuid,
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default now(),
  foreign key(business_id,qris_asset) references public.business_payment_assets(business_id,id),
  check(cash or qris or transfer),
  check(not qris or qris_asset is not null),
  check(not transfer or jsonb_array_length(banks)>0)
);
alter table public.business_payments enable row level security;
alter table public.business_payment_assets enable row level security;
revoke all on public.business_payments,public.business_payment_assets from anon,authenticated;
grant select on public.business_payments,public.business_payment_assets to authenticated;
grant all on public.business_payments,public.business_payment_assets to service_role;
create policy payment_settings_read on public.business_payments for select to authenticated using(public.has_business_access(business_id));
create policy payment_asset_read on public.business_payment_assets for select to authenticated using(public.has_business_access(business_id) and state='active' and exists(select 1 from public.business_payments p where p.business_id=business_payment_assets.business_id and p.qris_asset=business_payment_assets.id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('business-payment-qr','business-payment-qr',false,2097152,array['image/png']);
create policy payment_qr_read on storage.objects for select to authenticated using(bucket_id='business-payment-qr' and exists(select 1 from public.business_payment_assets a join public.business_payments p on p.business_id=a.business_id and p.qris_asset=a.id where a.path=storage.objects.name and a.state='active' and public.has_business_access(a.business_id)));

create function public.reserve_payment_qr(target_id uuid,asset_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare path text:=target_id::text||'/'||asset_id::text||'.png';
begin
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id,array['owner']) then raise exception 'Payment access denied' using errcode='42501'; end if;
  if asset_id is null then raise exception 'Invalid asset' using errcode='22023'; end if;
  insert into public.business_payment_assets(id,business_id,path) values(asset_id,target_id,path);
  return path;
end $$;

create function public.save_business_payments(target_id uuid,expected_revision integer,details jsonb,asset_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_settings public.business_payments; bank jsonb; next_qris boolean; next_transfer boolean; next_cash boolean; candidate public.business_payment_assets;
begin
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id,array['owner']) then raise exception 'Payment access denied' using errcode='42501'; end if;
  select * into current_settings from public.business_payments where business_id=target_id;
  if expected_revision is null or expected_revision<>coalesce(current_settings.revision,0) then raise exception 'Payments changed; reload' using errcode='PT409'; end if;
  if details is null or jsonb_typeof(details)<>'object' or details-array['cash','qris','transfer','banks']<>'{}'::jsonb
    or jsonb_typeof(details->'cash') is distinct from 'boolean' or jsonb_typeof(details->'qris') is distinct from 'boolean' or jsonb_typeof(details->'transfer') is distinct from 'boolean'
    or jsonb_typeof(details->'banks') is distinct from 'array' or jsonb_array_length(details->'banks')>10 then raise exception 'Invalid payment settings' using errcode='22023'; end if;
  next_cash:=(details->>'cash')::boolean;next_qris:=(details->>'qris')::boolean;next_transfer:=(details->>'transfer')::boolean;
  if not(next_cash or next_qris or next_transfer) or (next_qris and asset_id is null) or (not next_qris and asset_id is not null) or (next_transfer and jsonb_array_length(details->'banks')=0) then raise exception 'Complete payment settings' using errcode='22023'; end if;
  for bank in select value from jsonb_array_elements(details->'banks') loop
    if jsonb_typeof(bank)<>'object' or bank-array['bank','holder','account']<>'{}'::jsonb or jsonb_typeof(bank->'bank') is distinct from 'string' or jsonb_typeof(bank->'holder') is distinct from 'string' or jsonb_typeof(bank->'account') is distinct from 'string'
      or char_length(trim(bank->>'bank')) not between 1 and 100 or char_length(trim(bank->>'holder')) not between 1 and 160 or char_length(trim(bank->>'account')) not between 1 and 100 then raise exception 'Invalid bank details' using errcode='22023'; end if;
  end loop;
  if asset_id is not null then
    select * into candidate from public.business_payment_assets where id=asset_id and business_id=target_id for update;
    if not found or not(candidate.state='staging' or (candidate.state='active' and current_settings.qris_asset=asset_id))
      or not exists(select 1 from storage.objects where bucket_id='business-payment-qr' and name=candidate.path) then raise exception 'QR image unavailable' using errcode='22023'; end if;
  end if;
  insert into public.business_payments(business_id,cash,qris,transfer,banks,qris_asset) values(target_id,next_cash,next_qris,next_transfer,details->'banks',asset_id)
    on conflict(business_id) do update set cash=excluded.cash,qris=excluded.qris,transfer=excluded.transfer,banks=excluded.banks,qris_asset=excluded.qris_asset,revision=business_payments.revision+1,updated_at=now() returning * into current_settings;
  update public.business_payment_assets set state='retired' where business_id=target_id and state='active' and id is distinct from asset_id;
  update public.business_payment_assets set state='active' where id=asset_id;
  return to_jsonb(current_settings);
end $$;

create function public.claim_payment_qr_cleanup(asset_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare candidate public.business_payment_assets;
begin
  select * into candidate from public.business_payment_assets where id=asset_id;
  if not found then return null; end if;
  perform 1 from public.businesses where id=candidate.business_id for update;
  select * into candidate from public.business_payment_assets where id=asset_id for update;
  if candidate.state not in ('retired','deleting','staging') or (candidate.state='staging' and candidate.created_at>now()-interval '15 minutes') or exists(select 1 from public.business_payments where qris_asset=asset_id) then return null; end if;
  update public.business_payment_assets set state='deleting' where id=asset_id;
  return candidate.path;
end $$;
revoke all on function public.reserve_payment_qr(uuid,uuid),public.save_business_payments(uuid,integer,jsonb,uuid),public.claim_payment_qr_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.reserve_payment_qr(uuid,uuid),public.save_business_payments(uuid,integer,jsonb,uuid) to authenticated;
grant execute on function public.claim_payment_qr_cleanup(uuid) to service_role;

create or replace function public.checkout_pos(target_id uuid,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.business_members; p public.catalog_products; prior public.pos_requests; sale public.pos_transactions;
  line jsonb; snapshot jsonb:='[]'; amount numeric; line_total numeric; subtotal numeric:=0; discount numeric:=0;
  discount_value numeric; total numeric; received numeric; discount_kind text; payment text;
  selected_customer public.customers; customer_name text:='Pelanggan umum'; selected_id uuid; settings public.businesses; unit_price numeric; gross numeric; tax numeric; net numeric; configured public.business_payments;
begin
  -- Same lock order as catalog and inventory: business, then product IDs.
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id) then raise exception 'POS access denied' using errcode='42501'; end if;
  select * into settings from public.businesses where id=target_id;
  select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  if operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  select * into prior from public.pos_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>details then raise exception 'Request ID already used' using errcode='22023'; end if;
    select * into sale from public.pos_transactions where id=prior.transaction_id;
    return to_jsonb(sale);
  end if;
  if details is null or jsonb_typeof(details)<>'object' or details-array['lines','payment','received','discountKind','discountValue','customer','confirmed','customerId','taxRate','taxRevision','paymentRevision']<>'{}'::jsonb
    or details->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(details->'lines') is distinct from 'array'
    or jsonb_array_length(details->'lines') not between 1 and 100
    or (details ? 'customer' and (jsonb_typeof(details->'customer') is distinct from 'string' or char_length(trim(details->>'customer')) not between 1 and 100)) then
    raise exception 'Invalid checkout' using errcode='22023'; end if;
  if details ? 'customerId' and details->'customerId'<>'null'::jsonb then
    if jsonb_typeof(details->'customerId') is distinct from 'string' or (details->>'customerId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'Invalid customer' using errcode='22023'; end if;
    selected_id:=(details->>'customerId')::uuid;
    select * into selected_customer from public.customers where id=selected_id and business_id=target_id and active;
    if not found then raise exception 'Customer unavailable; reload' using errcode='PT409'; end if;
    customer_name:=selected_customer.name;
  end if;
  payment:=details->>'payment'; discount_kind:=details->>'discountKind';
  if payment is null or payment not in ('cash','qris','transfer') or discount_kind is null or discount_kind not in ('none','amount','percent')
    or coalesce(details->>'discountValue','') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    or coalesce(details->>'received','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid payment' using errcode='22023'; end if;
  discount_value:=(details->>'discountValue')::numeric; received:=(details->>'received')::numeric;
  if (discount_kind='none' and discount_value<>0) or (discount_kind='amount' and discount_value<>trunc(discount_value)) or (discount_kind='percent' and discount_value>100) then raise exception 'Invalid discount' using errcode='22023'; end if;
  if discount_kind<>'none' or discount_value<>0 then raise exception 'Use product discounts only' using errcode='22023'; end if;
  if coalesce(details->>'taxRate','0') !~ '^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$'
    or coalesce(details->>'taxRevision','0') !~ '^[0-9]{1,9}$' then raise exception 'Invalid tax settings' using errcode='22023'; end if;
  if (coalesce(details->>'taxRate','0'))::numeric<>settings.tax_rate or (coalesce(details->>'taxRevision','0'))::integer<>settings.tax_revision then raise exception 'Tax changed; reload' using errcode='PT409'; end if;
  select * into configured from public.business_payments where business_id=target_id;
  if coalesce(details->>'paymentRevision','0') !~ '^[0-9]{1,9}$' then raise exception 'Invalid payment revision' using errcode='22023'; end if;
  if (coalesce(details->>'paymentRevision','0'))::integer<>coalesce(configured.revision,0) then raise exception 'Payment methods changed; reload' using errcode='PT409'; end if;
  if configured.business_id is not null and not(case payment when 'cash' then configured.cash when 'qris' then configured.qris when 'transfer' then configured.transfer else false end) then raise exception 'Payment method disabled' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(details->'lines'))<>jsonb_array_length(details->'lines') then raise exception 'Duplicate product' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(details->'lines') order by value->>'id' loop
    if jsonb_typeof(line)<>'object' or line-array['id','quantity','price','revision']<>'{}'::jsonb
      or coalesce(line->>'revision','') !~ '^[0-9]{1,9}$' or coalesce(line->>'price','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid cart line' using errcode='22023'; end if;
    select * into p from public.catalog_products where business_id=target_id and id=(line->>'id')::uuid for update;
    if not found or not p.active then raise exception 'Product unavailable; reload' using errcode='PT409'; end if;
    if p.revision<>(line->>'revision')::integer or p.price<>(line->>'price')::numeric then raise exception 'Price changed; reload' using errcode='PT409'; end if;
    amount:=public.catalog_quantity(line->>'quantity');
    if amount<=0 or amount>p.stock then raise exception 'Insufficient stock' using errcode='PT409'; end if;
    unit_price:=case p.discount_kind when 'percent' then p.price-round(p.price*p.discount_value/100,0) when 'amount' then p.price-p.discount_value else p.price end;
    gross:=round(p.price*amount,0); line_total:=round(unit_price*amount,0);
    subtotal:=subtotal+gross; discount:=discount+gross-line_total;
    if subtotal>999999999999 then raise exception 'Total exceeds limit' using errcode='22023'; end if;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'unit',p.unit,'price',p.price,'quantity',amount,'total',line_total,'original_total',gross,'unit_price',unit_price,'discount_kind',p.discount_kind,'discount_value',p.discount_value,'discount',gross-line_total));
  end loop;
  if discount>subtotal then raise exception 'Discount exceeds subtotal' using errcode='22023'; end if;
  net:=subtotal-discount; tax:=round(net*settings.tax_rate/100,0); total:=net+tax;
  if total>999999999999 then raise exception 'Total exceeds limit' using errcode='22023'; end if;
  if received<total or (payment<>'cash' and received<>total) then raise exception 'Invalid received amount' using errcode='22023'; end if;
  insert into public.pos_transactions(business_id,actor_id,actor_name,customer,customer_id,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,tax_rate,tax_amount)
    values(target_id,auth.uid(),actor.name,customer_name,selected_id,snapshot,subtotal,discount_kind,discount_value,discount,total,payment,received,received-total,settings.tax_rate,tax) returning * into sale;
  for line in select value from jsonb_array_elements(snapshot) loop
    select * into p from public.catalog_products where id=(line->>'id')::uuid;
    amount:=(line->>'quantity')::numeric;
    update public.catalog_products set stock=stock-amount,stock_revision=stock_revision+1,updated_at=now() where id=p.id;
    insert into public.stock_movements(business_id,product_id,request_id,kind,quantity,before_stock,after_stock,product_name,unit,reason,actor_id,actor_name,sale_id)
      values(target_id,p.id,gen_random_uuid(),'sale',-amount,p.stock,p.stock-amount,p.name,p.unit,'Penjualan POS',auth.uid(),actor.name,sale.id);
  end loop;
  insert into public.pos_requests values(target_id,operation_id,auth.uid(),details,sale.id);
  return to_jsonb(sale);
end $$;
revoke all on function public.checkout_pos(uuid,uuid,jsonb) from public;
grant execute on function public.checkout_pos(uuid,uuid,jsonb) to authenticated;

commit;
