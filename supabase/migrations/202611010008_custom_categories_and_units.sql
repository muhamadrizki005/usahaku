begin;

-- Product custom categories table
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create unique index if not exists product_categories_business_name_idx
  on public.product_categories(business_id, lower(trim(name)));

alter table public.product_categories enable row level security;

drop policy if exists product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories
  for select using (public.has_business_access(business_id));

drop policy if exists product_categories_insert on public.product_categories;
create policy product_categories_insert on public.product_categories
  for insert with check (public.has_business_access(business_id, array['owner','admin']));

-- Product custom units table
create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);

create unique index if not exists product_units_business_name_idx
  on public.product_units(business_id, lower(trim(name)));

alter table public.product_units enable row level security;

drop policy if exists product_units_select on public.product_units;
create policy product_units_select on public.product_units
  for select using (public.has_business_access(business_id));

drop policy if exists product_units_insert on public.product_units;
create policy product_units_insert on public.product_units
  for insert with check (public.has_business_access(business_id, array['owner','admin']));

grant select, insert on public.product_categories to authenticated;
grant select, insert on public.product_units to authenticated;

-- Backfill from existing catalog products
insert into public.product_categories(business_id, name)
  select distinct business_id, trim(category)
  from public.catalog_products
  where trim(category) <> ''
  on conflict (business_id, lower(trim(name))) do nothing;

insert into public.product_units(business_id, name)
  select distinct business_id, trim(unit)
  from public.catalog_products
  where trim(unit) <> ''
  on conflict (business_id, lower(trim(name))) do nothing;

-- Update save_catalog_product to automatically record custom categories and units
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

  -- Automatically register custom category and unit if new
  insert into public.product_categories(business_id, name)
    values(target_id, trim(details->>'category'))
    on conflict (business_id, lower(trim(name))) do nothing;

  insert into public.product_units(business_id, name)
    values(target_id, trim(details->>'unit'))
    on conflict (business_id, lower(trim(name))) do nothing;

  insert into public.catalog_audit(business_id,product_id,actor_id,actor_name,before_data,after_data) values(target_id,item_id,auth.uid(),actor,old_row,to_jsonb(p));
  result:=to_jsonb(p);
  insert into public.catalog_requests(business_id,request_id,payload,response) values(target_id,operation_id,payload,result);
  return result;
end $$;

commit;

