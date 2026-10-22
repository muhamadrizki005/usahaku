begin;

create table public.catalog_products (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 160),
  category text not null check(char_length(category) between 1 and 100),
  unit text not null check(char_length(unit) between 1 and 30),
  sku text not null check(char_length(sku) between 1 and 64),
  barcode text not null default '' check(char_length(barcode)<=100),
  price numeric not null check(price between 0 and 999999999999 and price=trunc(price)),
  stock numeric not null default 0 check(stock between 0 and 999999999.999 and stock=trunc(stock,3)),
  minimum_stock numeric not null default 0 check(minimum_stock between 0 and 999999999.999 and minimum_stock=trunc(minimum_stock,3)),
  active boolean not null default true,
  revision integer not null default 0,
  stock_revision integer not null default 0,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id)
);
create unique index catalog_sku_unique on public.catalog_products(business_id,lower(sku));
create unique index catalog_barcode_unique on public.catalog_products(business_id,barcode) where barcode<>'';
create index catalog_business_name on public.catalog_products(business_id,name,id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  request_id uuid not null,
  kind text not null check(kind in ('initial','in','out','adjustment')),
  quantity numeric not null,
  before_stock numeric not null,
  after_stock numeric not null check(after_stock>=0 and after_stock=before_stock+quantity),
  product_name text not null,
  unit text not null,
  reason text not null check(char_length(reason) between 3 and 300),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  foreign key(business_id,product_id) references public.catalog_products(business_id,id) on delete cascade,
  unique(business_id,request_id)
);
create index stock_history on public.stock_movements(business_id,created_at desc,id);
create table public.catalog_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(business_id,product_id) references public.catalog_products(business_id,id) on delete cascade
);
create index catalog_audit_history on public.catalog_audit(business_id,created_at desc);
create table public.catalog_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(business_id,request_id)
);
alter table public.catalog_products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.catalog_audit enable row level security;
alter table public.catalog_requests enable row level security;
revoke all on public.catalog_products,public.stock_movements,public.catalog_audit,public.catalog_requests from anon,authenticated;
grant select on public.catalog_products,public.stock_movements,public.catalog_audit to authenticated;
grant all on public.catalog_products,public.stock_movements,public.catalog_audit,public.catalog_requests to service_role;
create policy catalog_read on public.catalog_products for select to authenticated using (
  public.has_business_access(business_id,array['owner','admin']) or (active and public.has_business_access(business_id,array['cashier']))
);
create policy stock_history_read on public.stock_movements for select to authenticated using(public.has_business_access(business_id,array['owner','admin']));
create policy catalog_audit_read on public.catalog_audit for select to authenticated using(public.has_business_access(business_id,array['owner','admin']));

create function public.catalog_quantity(value text, signed boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
  if value is null or value !~ '^-?(0|[1-9][0-9]*)([.,][0-9]{1,3})?$' or char_length(value)>20 then
    raise exception 'Quantity requires at most 3 decimal places' using errcode='22023';
  end if;
  n:=replace(value,',','.')::numeric;
  if abs(n)>999999999.999 or (not signed and n<0) then raise exception 'Quantity out of range' using errcode='22023'; end if;
  return n;
end $$;
revoke all on function public.catalog_quantity(text,boolean) from public;

-- One short transaction lock per business gives a consistent lock order and
-- idempotency even when a request is retried while its first response is lost.
create function public.catalog_request(target_id uuid, operation_id uuid, input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.catalog_requests;
begin
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id,array['owner','admin']) then raise exception 'Catalog access denied' using errcode='42501'; end if;
  if operation_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
  select * into previous from public.catalog_requests where business_id=target_id and request_id=operation_id;
  if found then
    if previous.payload<>input then raise exception 'Request ID already used for another operation' using errcode='22023'; end if;
    return previous.response;
  end if;
  return null;
end $$;
revoke all on function public.catalog_request(uuid,uuid,jsonb) from public;

create function public.save_catalog_product(target_id uuid,item_id uuid,expected_version integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.catalog_products; old_row jsonb; payload jsonb; result jsonb; amount numeric; minimum numeric; cost numeric; actor text; is_new boolean;
begin
  payload:=jsonb_build_object('kind','product','id',item_id,'revision',expected_version,'details',details);
  result:=public.catalog_request(target_id,operation_id,payload);
  if result is not null then return result; end if;
  if item_id is null or jsonb_typeof(details)<>'object' or details-array['name','category','unit','sku','barcode','price','minimum','initialStock','active']<>'{}'::jsonb then raise exception 'Invalid product' using errcode='22023'; end if;
  if jsonb_typeof(details->'name') is distinct from 'string' or char_length(trim(details->>'name')) not between 1 and 160
    or jsonb_typeof(details->'category') is distinct from 'string' or char_length(trim(details->>'category')) not between 1 and 100
    or jsonb_typeof(details->'unit') is distinct from 'string' or char_length(trim(details->>'unit')) not between 1 and 30
    or jsonb_typeof(details->'sku') is distinct from 'string' or char_length(trim(details->>'sku'))>64
    or jsonb_typeof(details->'barcode') is distinct from 'string' or char_length(trim(details->>'barcode'))>100
    or jsonb_typeof(details->'active') is distinct from 'boolean'
    or (details->>'price') is null or (details->>'price') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid product fields' using errcode='22023'; end if;
  cost:=(details->>'price')::numeric;
  minimum:=public.catalog_quantity(details->>'minimum'); amount:=public.catalog_quantity(details->>'initialStock');
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  select * into p from public.catalog_products where id=item_id for update;
  is_new:=not found;
  if is_new then
    if expected_version is not null then raise exception 'Product missing; reload' using errcode='PT409'; end if;
    insert into public.catalog_products(id,business_id,name,category,unit,sku,barcode,price,minimum_stock,stock)
      values(item_id,target_id,trim(details->>'name'),trim(details->>'category'),trim(details->>'unit'),coalesce(nullif(trim(details->>'sku'),''),'PRD-'||replace(item_id::text,'-','')),trim(details->>'barcode'),cost,minimum,amount) returning * into p;
    update public.catalog_products set active=(details->>'active')::boolean where id=item_id returning * into p;
    insert into public.stock_movements(business_id,product_id,request_id,kind,quantity,before_stock,after_stock,product_name,unit,reason,actor_id,actor_name)
      values(target_id,item_id,operation_id,'initial',amount,0,amount,p.name,p.unit,'Stok awal',auth.uid(),actor);
  else
    if p.business_id<>target_id then raise exception 'Product access denied' using errcode='42501'; end if;
    if expected_version is null or expected_version<>p.revision then raise exception 'Product changed; reload' using errcode='PT409'; end if;
    if trim(details->>'unit')<>p.unit or amount<>0 then raise exception 'Unit is fixed; use inventory actions to change stock' using errcode='22023'; end if;
    old_row:=to_jsonb(p);
    update public.catalog_products set name=trim(details->>'name'),category=trim(details->>'category'),sku=coalesce(nullif(trim(details->>'sku'),''),p.sku),barcode=trim(details->>'barcode'),price=cost,minimum_stock=minimum,active=(details->>'active')::boolean,revision=revision+1,updated_at=now() where id=item_id returning * into p;
  end if;
  insert into public.catalog_audit(business_id,product_id,actor_id,actor_name,before_data,after_data) values(target_id,item_id,auth.uid(),actor,old_row,to_jsonb(p));
  result:=to_jsonb(p);
  insert into public.catalog_requests(business_id,request_id,payload,response) values(target_id,operation_id,payload,result);
  return result;
end $$;
revoke all on function public.save_catalog_product(uuid,uuid,integer,uuid,jsonb) from public;
grant execute on function public.save_catalog_product(uuid,uuid,integer,uuid,jsonb) to authenticated;

create function public.move_catalog_stock(target_id uuid,item_id uuid,expected_version integer,operation_id uuid,change text,movement_kind text,explanation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.catalog_products; payload jsonb; result jsonb; amount numeric; previous numeric; actor text;
begin
  payload:=jsonb_build_object('kind','stock','id',item_id,'revision',expected_version,'change',change,'type',movement_kind,'reason',explanation);
  result:=public.catalog_request(target_id,operation_id,payload);
  if result is not null then return result; end if;
  amount:=public.catalog_quantity(change,true);
  if movement_kind is null or movement_kind not in ('in','out','adjustment') or amount=0
    or (movement_kind='in' and amount<0) or (movement_kind='out' and amount>0)
    or explanation is null or char_length(trim(explanation)) not between 3 and 300 then raise exception 'Invalid stock movement' using errcode='22023'; end if;
  select * into p from public.catalog_products where id=item_id and business_id=target_id for update;
  if not found then raise exception 'Product access denied' using errcode='42501'; end if;
  if expected_version is null or expected_version<>p.stock_revision then raise exception 'Stock changed; reload' using errcode='PT409'; end if;
  previous:=p.stock;
  if previous+amount not between 0 and 999999999.999 then raise exception 'Stock cannot be negative or exceed limit' using errcode='22023'; end if;
  update public.catalog_products set stock=stock+amount,stock_revision=stock_revision+1,updated_at=now() where id=item_id returning * into p;
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  insert into public.stock_movements(business_id,product_id,request_id,kind,quantity,before_stock,after_stock,product_name,unit,reason,actor_id,actor_name)
    values(target_id,item_id,operation_id,movement_kind,amount,previous,p.stock,p.name,p.unit,trim(explanation),auth.uid(),actor);
  result:=to_jsonb(p);
  insert into public.catalog_requests(business_id,request_id,payload,response) values(target_id,operation_id,payload,result);
  return result;
end $$;
revoke all on function public.move_catalog_stock(uuid,uuid,integer,uuid,text,text,text) from public;
grant execute on function public.move_catalog_stock(uuid,uuid,integer,uuid,text,text,text) to authenticated;

-- Images are staged at immutable paths and promoted only after object upload.
create table public.product_image_assets (
  id uuid primary key,
  business_id uuid not null,
  product_id uuid not null,
  path text unique not null,
  state text not null default 'staging' check(state in ('staging','active','retired','deleting','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(business_id,product_id) references public.catalog_products(business_id,id) on delete cascade,
  check(path=business_id::text||'/'||product_id::text||'/'||id::text||'.png')
);
create index product_asset_cleanup on public.product_image_assets(product_id,state,created_at);
alter table public.product_image_assets enable row level security;
revoke all on public.product_image_assets from anon,authenticated;
grant all on public.product_image_assets to service_role;
alter table public.catalog_products add constraint product_image_reference foreign key(image_path) references public.product_image_assets(path) deferrable initially deferred;
alter table public.catalog_products add constraint product_image_prefix check(image_path is null or left(image_path,74)=business_id::text||'/'||id::text||'/');

create function public.reserve_product_image(target_id uuid,item_id uuid,asset_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare path_value text;
begin
  if not public.has_business_access(target_id,array['owner','admin']) or not exists(select 1 from public.catalog_products where id=item_id and business_id=target_id) then raise exception 'Product access denied' using errcode='42501'; end if;
  path_value:=target_id::text||'/'||item_id::text||'/'||asset_id::text||'.png';
  insert into public.product_image_assets(id,business_id,product_id,path) values(asset_id,target_id,item_id,path_value);
  return path_value;
end $$;
revoke all on function public.reserve_product_image(uuid,uuid,uuid) from public;
grant execute on function public.reserve_product_image(uuid,uuid,uuid) to authenticated;

create function public.set_product_image(target_id uuid,item_id uuid,expected_version integer,asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.catalog_products; asset public.product_image_assets; actor text; old_row jsonb;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not public.has_business_access(target_id,array['owner','admin']) then raise exception 'Product access denied' using errcode='42501'; end if;
  select * into p from public.catalog_products where id=item_id and business_id=target_id for update;
  if not found then raise exception 'Product missing' using errcode='42501'; end if;
  if expected_version is null or expected_version<>p.revision then raise exception 'Product changed; reload' using errcode='PT409'; end if;
  if asset_id is not null then
    select * into asset from public.product_image_assets where id=asset_id and business_id=target_id and product_id=item_id for update;
    if not found or asset.state<>'staging' then raise exception 'Invalid image candidate' using errcode='22023'; end if;
    if not exists(select 1 from storage.objects where bucket_id='product-images' and name=asset.path and metadata->>'mimetype'='image/png' and (metadata->>'size')::bigint between 1 and 2097152) then raise exception 'Image not uploaded' using errcode='22023'; end if;
  end if;
  old_row:=to_jsonb(p);
  update public.product_image_assets set state='retired',updated_at=now() where path=p.image_path and state='active';
  if asset_id is not null then update public.product_image_assets set state='active',updated_at=now() where id=asset_id; end if;
  update public.catalog_products set image_path=asset.path,revision=revision+1,updated_at=now() where id=item_id returning * into p;
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  insert into public.catalog_audit(business_id,product_id,actor_id,actor_name,before_data,after_data) values(target_id,item_id,auth.uid(),actor,old_row,to_jsonb(p));
  return to_jsonb(p);
end $$;
revoke all on function public.set_product_image(uuid,uuid,integer,uuid) from public;
grant execute on function public.set_product_image(uuid,uuid,integer,uuid) to authenticated;

create function public.claim_product_image_cleanup(asset_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare asset public.product_image_assets; current_path text; target uuid; item uuid;
begin
  select business_id,product_id into target,item from public.product_image_assets where id=asset_id;
  if not found then return null; end if;
  perform 1 from public.businesses where id=target for update;
  select image_path into current_path from public.catalog_products where id=item for update;
  select * into asset from public.product_image_assets where id=asset_id for update;
  if asset.path=current_path or asset.state in ('active','deleted') or (asset.state='staging' and asset.created_at>now()-interval '15 minutes') then return null; end if;
  update public.product_image_assets set state='deleting',updated_at=now() where id=asset_id;
  return asset.path;
end $$;
revoke all on function public.claim_product_image_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.claim_product_image_cleanup(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',false,2097152,array['image/png']);
create policy product_current_image_read on storage.objects for select to authenticated using (
  bucket_id='product-images' and exists(select 1 from public.catalog_products p where p.image_path=name and public.has_business_access(p.business_id) and (p.active or public.has_business_access(p.business_id,array['owner','admin'])))
);
notify pgrst,'reload schema';
commit;
