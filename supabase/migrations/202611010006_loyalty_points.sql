begin;

alter table public.businesses
  add column if not exists loyalty_active boolean not null default false,
  add column if not exists loyalty_point_nominal numeric not null default 50000 check (loyalty_point_nominal > 0);

alter table public.customers
  add column if not exists points integer not null default 0 check (points >= 0);

alter table public.pos_transactions
  add column if not exists points_earned integer not null default 0 check (points_earned >= 0);

create table if not exists public.customer_point_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  sale_id uuid references public.pos_transactions(id) on delete set null,
  kind text not null check (kind in ('earn', 'refund', 'adjustment')),
  points integer not null,
  before_points integer not null default 0,
  after_points integer not null default 0,
  description text not null default '',
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  foreign key (business_id, customer_id) references public.customers(business_id, id) on delete cascade
);

create index if not exists customer_point_history_customer on public.customer_point_history(business_id, customer_id, created_at desc);
create index if not exists customer_point_history_sale on public.customer_point_history(business_id, sale_id);

alter table public.customer_point_history enable row level security;
revoke all on public.customer_point_history from anon, authenticated;
grant select on public.customer_point_history to authenticated;
grant all on public.customer_point_history to service_role;

drop policy if exists customer_point_history_read on public.customer_point_history;
create policy customer_point_history_read on public.customer_point_history
  for select to authenticated using (public.has_business_access(business_id, array['owner','admin','cashier']));

create or replace function public.save_business_loyalty_settings(
  target_id uuid,
  new_active boolean,
  new_nominal numeric
) returns public.businesses
language plpgsql security definer set search_path = '' as $$
declare result public.businesses;
begin
  perform 1 from public.businesses where id = target_id for update;
  if not found or not public.has_business_access(target_id, array['owner', 'admin']) then
    raise exception 'Loyalty settings access denied' using errcode = '42501';
  end if;
  if new_active is null or new_nominal is null or new_nominal <= 0 or new_nominal > 1000000000 then
    raise exception 'Invalid loyalty configuration' using errcode = '22023';
  end if;
  update public.businesses
    set loyalty_active = new_active,
        loyalty_point_nominal = round(new_nominal, 0)
    where id = target_id
    returning * into result;
  return result;
end $$;
revoke all on function public.save_business_loyalty_settings(uuid, boolean, numeric) from public;
grant execute on function public.save_business_loyalty_settings(uuid, boolean, numeric) to authenticated;

create or replace function public.checkout_pos(target_id uuid,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.business_members; p public.catalog_products; prior public.pos_requests; sale public.pos_transactions;
  line jsonb; snapshot jsonb:='[]'; amount numeric; line_total numeric; subtotal numeric:=0; discount numeric:=0;
  discount_value numeric; total numeric; received numeric; discount_kind text; payment text;
  selected_customer public.customers; customer_name text:='Pelanggan umum'; selected_id uuid; settings public.businesses; unit_price numeric; gross numeric; tax numeric; net numeric; configured public.business_payments;
  earned_points integer := 0; before_pts integer := 0; after_pts integer := 0;
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

  -- Calculate loyalty points if enabled and customer selected
  if selected_id is not null and coalesce(settings.loyalty_active, false) and coalesce(settings.loyalty_point_nominal, 0) > 0 then
    earned_points := floor(total / settings.loyalty_point_nominal)::integer;
  else
    earned_points := 0;
  end if;

  insert into public.pos_transactions(business_id,actor_id,actor_name,customer,customer_id,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,tax_rate,tax_amount,points_earned)
    values(target_id,auth.uid(),actor.name,customer_name,selected_id,snapshot,subtotal,discount_kind,discount_value,discount,total,payment,received,received-total,settings.tax_rate,tax,earned_points) returning * into sale;

  -- Award points and create ledger history
  if selected_id is not null and earned_points > 0 then
    select points into before_pts from public.customers where id = selected_id for update;
    after_pts := before_pts + earned_points;
    update public.customers set points = after_pts, updated_at = now() where id = selected_id;
    insert into public.customer_point_history(business_id, customer_id, sale_id, kind, points, before_points, after_points, description, actor_id, actor_name)
      values(target_id, selected_id, sale.id, 'earn', earned_points, before_pts, after_pts, 'Transaksi POS ' || sale.id::text, auth.uid(), actor.name);
  end if;

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

create or replace function public.cancel_pos(target_id uuid,sale_id uuid,explanation text,goods_returned boolean,refund_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sale public.pos_transactions; p public.catalog_products; line jsonb; amount numeric; actor text;
  cust_pts integer := 0; deduct_pts integer := 0; after_pts integer := 0;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_business_access(target_id,array['owner','admin']) then raise exception 'Cancellation access denied' using errcode='42501'; end if;
  select * into sale from public.pos_transactions where id=sale_id and business_id=target_id for update;
  if not found then raise exception 'Sale access denied' using errcode='42501'; end if;
  if sale.status='cancelled' then return to_jsonb(sale); end if;
  if explanation is null or char_length(trim(explanation)) not between 3 and 300 or goods_returned is distinct from true or refund_confirmed is distinct from true then raise exception 'Confirm returned goods and manual refund' using errcode='22023'; end if;
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  for line in select value from jsonb_array_elements(sale.lines) order by value->>'id' loop
    select * into p from public.catalog_products where id=(line->>'id')::uuid and business_id=target_id for update;
    amount:=(line->>'quantity')::numeric;
    if not found or p.stock+amount>999999999.999 then raise exception 'Returned stock exceeds limit' using errcode='22023'; end if;
    update public.catalog_products set stock=stock+amount,stock_revision=stock_revision+1,updated_at=now() where id=p.id;
    insert into public.stock_movements(business_id,product_id,request_id,kind,quantity,before_stock,after_stock,product_name,unit,reason,actor_id,actor_name,sale_id)
      values(target_id,p.id,gen_random_uuid(),'sale_cancel',amount,p.stock,p.stock+amount,line->>'name',line->>'unit','Pembatalan POS: '||trim(explanation),auth.uid(),actor,sale.id);
  end loop;

  -- Reverse loyalty points if awarded
  if sale.customer_id is not null and coalesce(sale.points_earned, 0) > 0 then
    select points into cust_pts from public.customers where id=sale.customer_id and business_id=target_id for update;
    if cust_pts is not null then
      deduct_pts := least(cust_pts, sale.points_earned);
      after_pts := cust_pts - deduct_pts;
      update public.customers set points = after_pts, updated_at = now() where id = sale.customer_id;
      insert into public.customer_point_history(business_id, customer_id, sale_id, kind, points, before_points, after_points, description, actor_id, actor_name)
        values(target_id, sale.customer_id, sale.id, 'refund', -deduct_pts, cust_pts, after_pts, 'Pembatalan transaksi POS: ' || trim(explanation), auth.uid(), actor);
    end if;
  end if;

  update public.pos_transactions set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancelled_by_name=actor,cancellation_reason=trim(explanation),refund_amount=sale.total
    where id=sale.id and business_id=target_id returning * into sale;
  return to_jsonb(sale);
end $$;
revoke all on function public.cancel_pos(uuid,uuid,text,boolean,boolean) from public;
grant execute on function public.cancel_pos(uuid,uuid,text,boolean,boolean) to authenticated;

commit;
