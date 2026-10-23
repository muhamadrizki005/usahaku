-- Auto numbering runs inside save_catalog_product after catalog_request locks the business.
-- Existing rows and explicit SKUs are never rewritten by this migration.
create function public.catalog_sku_prefix(category_name text, product_name text) returns text
language sql immutable set search_path='' as $$
  select coalesce(nullif(case lower(trim(category_name))
    when 'minuman' then 'MIN' when 'makanan' then 'MAK' when 'bahan pokok' then 'BPK'
    else left(regexp_replace(upper(category_name),'[^A-Z0-9]','','g'),3) end,''),'PRD')
    || '-' || coalesce(nullif(left((select string_agg(left(word,1),'' order by ordinal)
      from regexp_split_to_table(upper(product_name),'[^A-Z0-9]+') with ordinality as words(word,ordinal)
      where word<>''),24),''),'P') || '-';
$$;
revoke all on function public.catalog_sku_prefix(text,text) from public,anon,authenticated;

create function public.next_catalog_sku(target_id uuid,category_name text,product_name text) returns text
language plpgsql set search_path='' as $$
declare prefix text:=public.catalog_sku_prefix(category_name,product_name); number numeric; candidate text;
begin
  select coalesce(max(substring(sku from length(prefix)+1)::numeric),0)+1 into number
    from public.catalog_products
    where business_id=target_id and left(lower(sku),length(prefix))=lower(prefix)
      and substring(sku from length(prefix)+1) ~ '^[0-9]+$';
  candidate:=prefix||lpad(number::text,greatest(3,length(number::text)),'0');
  if length(candidate)>64 then raise exception 'SKU numbering limit reached; use a custom SKU' using errcode='22023'; end if;
  return candidate;
end $$;
revoke all on function public.next_catalog_sku(uuid,text,text) from public,anon,authenticated;

create or replace function public.save_catalog_product(target_id uuid,item_id uuid,expected_version integer,operation_id uuid,details jsonb) returns jsonb
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
      values(item_id,target_id,trim(details->>'name'),trim(details->>'category'),trim(details->>'unit'),coalesce(nullif(trim(details->>'sku'),''),public.next_catalog_sku(target_id,details->>'category',details->>'name')),trim(details->>'barcode'),cost,minimum,amount) returning * into p;
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
