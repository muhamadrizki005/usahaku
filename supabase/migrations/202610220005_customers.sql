begin;

create table public.customers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 100),
  phone text not null default '' check(phone='' or phone ~ '^\+[1-9][0-9]{7,14}$'),
  notes text not null default '' check(char_length(notes)<=1000),
  active boolean not null default true,
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id)
);
create index customer_names on public.customers(business_id,lower(name),id);
create index customer_phones on public.customers(business_id,phone) where phone<>'';
create table public.customer_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade
);
create table public.customer_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  payload jsonb not null,
  primary key(business_id,request_id),
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade
);
alter table public.customers enable row level security;
alter table public.customer_audit enable row level security;
alter table public.customer_requests enable row level security;
revoke all on public.customers,public.customer_audit,public.customer_requests from anon,authenticated;
grant select on public.customers,public.customer_audit to authenticated;
grant all on public.customers,public.customer_audit,public.customer_requests to service_role;
create policy customer_read on public.customers for select to authenticated using(public.has_business_access(business_id,array['owner','admin']));
create policy customer_audit_read on public.customer_audit for select to authenticated using(public.has_business_access(business_id,array['owner','admin']));

alter table public.pos_transactions add column customer_id uuid;
alter table public.pos_transactions add constraint sale_customer_business_fk foreign key(business_id,customer_id) references public.customers(business_id,id);
create index customer_sales on public.pos_transactions(business_id,customer_id,created_at desc,id) where customer_id is not null;

create function public.normalize_customer_phone(value text) returns text
language plpgsql immutable set search_path='' as $$
declare result text;
begin
  if value is null or char_length(value)>40 then raise exception 'Invalid phone' using errcode='22023'; end if;
  result:=regexp_replace(trim(value),'[[:space:]().-]','','g');
  if result='' then return ''; end if;
  if left(result,1)='0' then result:='+62'||substr(result,2);
  elsif left(result,2)='62' then result:='+'||result; end if;
  if result !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid phone' using errcode='22023'; end if;
  return result;
end $$;
revoke all on function public.normalize_customer_phone(text) from public;

create function public.save_customer(target_id uuid,item_id uuid,expected_version integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.customers; prior public.customer_requests; payload jsonb; before_row jsonb; normalized_phone text; actor text;
begin
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id,array['owner','admin']) then raise exception 'Customer access denied' using errcode='42501'; end if;
  if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('id',item_id,'revision',expected_version,'details',details);
  select * into prior from public.customer_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
    select * into item from public.customers where id=prior.customer_id and business_id=target_id;
    return to_jsonb(item);
  end if;
  if details is null or jsonb_typeof(details)<>'object' or details-array['name','phone','notes','active']<>'{}'::jsonb
    or jsonb_typeof(details->'name') is distinct from 'string' or char_length(trim(details->>'name')) not between 1 and 100
    or jsonb_typeof(details->'phone') is distinct from 'string' or jsonb_typeof(details->'notes') is distinct from 'string'
    or char_length(details->>'notes')>1000 or jsonb_typeof(details->'active') is distinct from 'boolean' then raise exception 'Invalid customer' using errcode='22023'; end if;
  normalized_phone:=public.normalize_customer_phone(details->>'phone');
  select * into item from public.customers where id=item_id for update;
  if found then
    if item.business_id<>target_id then raise exception 'Customer access denied' using errcode='42501'; end if;
    if expected_version is null or expected_version<>item.revision then raise exception 'Customer changed; reload' using errcode='PT409'; end if;
    before_row:=to_jsonb(item);
    update public.customers set name=trim(details->>'name'),phone=normalized_phone,notes=trim(details->>'notes'),active=(details->>'active')::boolean,revision=revision+1,updated_at=now() where id=item_id returning * into item;
  else
    if expected_version is not null then raise exception 'Customer missing; reload' using errcode='PT409'; end if;
    insert into public.customers(id,business_id,name,phone,notes,active) values(item_id,target_id,trim(details->>'name'),normalized_phone,trim(details->>'notes'),(details->>'active')::boolean) returning * into item;
  end if;
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  insert into public.customer_audit(business_id,customer_id,actor_id,actor_name,before_data,after_data) values(target_id,item_id,auth.uid(),actor,before_row,to_jsonb(item));
  insert into public.customer_requests values(target_id,operation_id,auth.uid(),item_id,payload);
  return to_jsonb(item);
end $$;
revoke all on function public.save_customer(uuid,uuid,integer,uuid,jsonb) from public;
grant execute on function public.save_customer(uuid,uuid,integer,uuid,jsonb) to authenticated;

-- POS receives a bounded projection, never notes, audit or customer history.
create function public.search_pos_customers(target_id uuid,term text) returns table(id uuid,name text,phone text)
language plpgsql stable security definer set search_path='' as $$
declare query text; digits text;
begin
  if not public.has_business_access(target_id) then raise exception 'Customer access denied' using errcode='42501'; end if;
  query:=lower(trim(term));
  if query is null or char_length(query) not between 2 and 100 then return; end if;
  digits:=regexp_replace(query,'[^0-9]','','g');
  if left(digits,1)='0' then digits:='62'||substr(digits,2); end if;
  return query select c.id,c.name,c.phone from public.customers c
    where c.business_id=target_id and c.active and
      (position(query in lower(c.name))>0 or (char_length(digits)>=3 and position(digits in c.phone)>0))
    order by lower(c.name),c.id limit 20;
end $$;
revoke all on function public.search_pos_customers(uuid,text) from public;
grant execute on function public.search_pos_customers(uuid,text) to authenticated;

-- checkout_pos is replaced below; existing sales are never backfilled by name.

create or replace function public.checkout_pos(target_id uuid,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.business_members; p public.catalog_products; prior public.pos_requests; sale public.pos_transactions;
  line jsonb; snapshot jsonb:='[]'; amount numeric; line_total numeric; subtotal numeric:=0; discount numeric:=0;
  discount_value numeric; total numeric; received numeric; discount_kind text; payment text;
  selected_customer public.customers; customer_name text:='Pelanggan umum'; selected_id uuid;
begin
  -- Same lock order as catalog and inventory: business, then product IDs.
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id) then raise exception 'POS access denied' using errcode='42501'; end if;
  select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  if operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  select * into prior from public.pos_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>details then raise exception 'Request ID already used' using errcode='22023'; end if;
    select * into sale from public.pos_transactions where id=prior.transaction_id;
    return to_jsonb(sale);
  end if;
  if details is null or jsonb_typeof(details)<>'object' or details-array['lines','payment','received','discountKind','discountValue','customer','confirmed','customerId']<>'{}'::jsonb
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
  if discount_kind<>'none' and actor.role not in ('owner','admin') then raise exception 'Discount access denied' using errcode='42501'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(details->'lines'))<>jsonb_array_length(details->'lines') then raise exception 'Duplicate product' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(details->'lines') order by value->>'id' loop
    if jsonb_typeof(line)<>'object' or line-array['id','quantity','price','revision']<>'{}'::jsonb
      or coalesce(line->>'revision','') !~ '^[0-9]{1,9}$' or coalesce(line->>'price','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid cart line' using errcode='22023'; end if;
    select * into p from public.catalog_products where business_id=target_id and id=(line->>'id')::uuid for update;
    if not found or not p.active then raise exception 'Product unavailable; reload' using errcode='PT409'; end if;
    if p.revision<>(line->>'revision')::integer or p.price<>(line->>'price')::numeric then raise exception 'Price changed; reload' using errcode='PT409'; end if;
    amount:=public.catalog_quantity(line->>'quantity');
    if amount<=0 or amount>p.stock then raise exception 'Insufficient stock' using errcode='PT409'; end if;
    line_total:=round(p.price*amount,0); subtotal:=subtotal+line_total;
    if subtotal>999999999999 then raise exception 'Total exceeds limit' using errcode='22023'; end if;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'unit',p.unit,'price',p.price,'quantity',amount,'total',line_total));
  end loop;
  discount:=case discount_kind when 'amount' then discount_value when 'percent' then round(subtotal*discount_value/100,0) else 0 end;
  if discount>subtotal then raise exception 'Discount exceeds subtotal' using errcode='22023'; end if;
  total:=subtotal-discount;
  if received<total or (payment<>'cash' and received<>total) then raise exception 'Invalid received amount' using errcode='22023'; end if;
  insert into public.pos_transactions(business_id,actor_id,actor_name,customer,customer_id,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change)
    values(target_id,auth.uid(),actor.name,customer_name,selected_id,snapshot,subtotal,discount_kind,discount_value,discount,total,payment,received,received-total) returning * into sale;
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
