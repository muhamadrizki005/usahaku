begin;

alter table public.catalog_products
  add column discount_kind text not null default 'none',
  add column discount_value numeric not null default 0,
  add constraint catalog_discount_valid check (
    discount_kind in ('none','percent','amount') and discount_value>=0 and
    ((discount_kind='none' and discount_value=0) or
     (discount_kind='percent' and discount_value<=100 and discount_value=round(discount_value,2)) or
     (discount_kind='amount' and discount_value<=price and discount_value=trunc(discount_value))));

alter table public.businesses
  add column tax_rate numeric not null default 0 check(tax_rate between 0 and 100 and tax_rate=round(tax_rate,2)),
  add column tax_revision integer not null default 0 check(tax_revision>=0);

alter table public.pos_transactions
  add column tax_rate numeric not null default 0 check(tax_rate between 0 and 100),
  add column tax_amount numeric not null default 0 check(tax_amount>=0);
do $$
declare old_constraint text;
begin
  select conname into strict old_constraint from pg_catalog.pg_constraint
    where conrelid='public.pos_transactions'::regclass and contype='c'
      and regexp_replace(pg_catalog.pg_get_constraintdef(oid),'[[:space:]()]','','g')='CHECKtotal=subtotal-discount';
  execute format('alter table public.pos_transactions drop constraint %I',old_constraint);
end $$;
alter table public.pos_transactions add constraint pos_total_with_tax check(
  total=subtotal-discount+tax_amount and total<=999999999999 and
  tax_amount=round((subtotal-discount)*tax_rate/100,0));

create function public.save_store_tax(target_id uuid,expected_version integer,rate numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.businesses;
begin
  select * into b from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id,array['owner']) then raise exception 'Tax access denied' using errcode='42501'; end if;
  if rate is null or rate not between 0 and 100 or rate<>round(rate,2) then raise exception 'Invalid tax rate' using errcode='22023'; end if;
  if expected_version is null or expected_version<>b.tax_revision then raise exception 'Tax changed; reload' using errcode='PT409'; end if;
  update public.businesses set tax_rate=rate,tax_revision=tax_revision+1 where id=target_id returning * into b;
  return jsonb_build_object('rate',b.tax_rate,'revision',b.tax_revision);
end $$;
revoke all on function public.save_store_tax(uuid,integer,numeric) from public,anon;
grant execute on function public.save_store_tax(uuid,integer,numeric) to authenticated;

create or replace function public.save_catalog_product(target_id uuid,item_id uuid,expected_version integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<save_catalog_product>>
declare p public.catalog_products; old_row jsonb; payload jsonb; result jsonb; amount numeric; minimum numeric; cost numeric; actor text; is_new boolean; discount_kind text; discount_value numeric;
begin
  payload:=jsonb_build_object('kind','product','id',item_id,'revision',expected_version,'details',details);
  result:=public.catalog_request(target_id,operation_id,payload);
  if result is not null then return result; end if;
  if item_id is null or jsonb_typeof(details)<>'object' or details-array['name','category','unit','sku','barcode','price','minimum','initialStock','active','discountKind','discountValue']<>'{}'::jsonb then raise exception 'Invalid product' using errcode='22023'; end if;
  if jsonb_typeof(details->'name') is distinct from 'string' or char_length(trim(details->>'name')) not between 1 and 160
    or jsonb_typeof(details->'category') is distinct from 'string' or char_length(trim(details->>'category')) not between 1 and 100
    or jsonb_typeof(details->'unit') is distinct from 'string' or char_length(trim(details->>'unit')) not between 1 and 30
    or jsonb_typeof(details->'sku') is distinct from 'string' or char_length(trim(details->>'sku'))>64
    or jsonb_typeof(details->'barcode') is distinct from 'string' or char_length(trim(details->>'barcode'))>100
    or jsonb_typeof(details->'active') is distinct from 'boolean'
    or (details->>'price') is null or (details->>'price') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid product fields' using errcode='22023'; end if;
  cost:=(details->>'price')::numeric;
  discount_kind:=coalesce(details->>'discountKind','none');
  if discount_kind not in ('none','amount','percent') or coalesce(details->>'discountValue','0') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' then raise exception 'Invalid product discount' using errcode='22023'; end if;
  discount_value:=coalesce(details->>'discountValue','0')::numeric;
  if (discount_kind='none' and discount_value<>0) or (discount_kind='percent' and discount_value>100) or (discount_kind='amount' and (discount_value<>trunc(discount_value) or discount_value>cost)) then raise exception 'Invalid product discount' using errcode='22023'; end if;
  minimum:=public.catalog_quantity(details->>'minimum'); amount:=public.catalog_quantity(details->>'initialStock');
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  select * into p from public.catalog_products where id=item_id for update;
  is_new:=not found;
  if is_new then
    if expected_version is not null then raise exception 'Product missing; reload' using errcode='PT409'; end if;
    insert into public.catalog_products(id,business_id,name,category,unit,sku,barcode,price,minimum_stock,stock)
      values(item_id,target_id,trim(details->>'name'),trim(details->>'category'),trim(details->>'unit'),coalesce(nullif(trim(details->>'sku'),''),public.next_catalog_sku(target_id,details->>'category',details->>'name')),trim(details->>'barcode'),cost,minimum,amount) returning * into p;
    update public.catalog_products set active=(details->>'active')::boolean,discount_kind=save_catalog_product.discount_kind,discount_value=save_catalog_product.discount_value where id=item_id returning * into p;
    insert into public.stock_movements(business_id,product_id,request_id,kind,quantity,before_stock,after_stock,product_name,unit,reason,actor_id,actor_name)
      values(target_id,item_id,operation_id,'initial',amount,0,amount,p.name,p.unit,'Stok awal',auth.uid(),actor);
  else
    if p.business_id<>target_id then raise exception 'Product access denied' using errcode='42501'; end if;
    if expected_version is null or expected_version<>p.revision then raise exception 'Product changed; reload' using errcode='PT409'; end if;
    if trim(details->>'unit')<>p.unit or amount<>0 then raise exception 'Unit is fixed; use inventory actions to change stock' using errcode='22023'; end if;
    old_row:=to_jsonb(p);
    update public.catalog_products set name=trim(details->>'name'),category=trim(details->>'category'),sku=coalesce(nullif(trim(details->>'sku'),''),p.sku),barcode=trim(details->>'barcode'),price=cost,discount_kind=save_catalog_product.discount_kind,discount_value=save_catalog_product.discount_value,minimum_stock=minimum,active=(details->>'active')::boolean,revision=revision+1,updated_at=now() where id=item_id returning * into p;
  end if;
  insert into public.catalog_audit(business_id,product_id,actor_id,actor_name,before_data,after_data) values(target_id,item_id,auth.uid(),actor,old_row,to_jsonb(p));
  result:=to_jsonb(p);
  insert into public.catalog_requests(business_id,request_id,payload,response) values(target_id,operation_id,payload,result);
  return result;
end $$;

create or replace function public.checkout_pos(target_id uuid,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.business_members; p public.catalog_products; prior public.pos_requests; sale public.pos_transactions;
  line jsonb; snapshot jsonb:='[]'; amount numeric; line_total numeric; subtotal numeric:=0; discount numeric:=0;
  discount_value numeric; total numeric; received numeric; discount_kind text; payment text;
  selected_customer public.customers; customer_name text:='Pelanggan umum'; selected_id uuid; settings public.businesses; unit_price numeric; gross numeric; tax numeric; net numeric;
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
  if details is null or jsonb_typeof(details)<>'object' or details-array['lines','payment','received','discountKind','discountValue','customer','confirmed','customerId','taxRate','taxRevision']<>'{}'::jsonb
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

