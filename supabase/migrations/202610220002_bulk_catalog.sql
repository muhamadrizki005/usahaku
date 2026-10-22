begin;
create function public.bulk_catalog_products(target_id uuid,operation_id uuid,items jsonb,new_category text,new_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; result jsonb; item jsonb; p public.catalog_products; old_row jsonb; actor text;
begin
  payload:=jsonb_build_object('kind','bulk','items',items,'category',new_category,'active',new_active);
  result:=public.catalog_request(target_id,operation_id,payload);if result is not null then return result; end if;
  if jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid selection' using errcode='22023'; end if;
  if jsonb_array_length(items) not between 1 and 500 or (new_category is null)=(new_active is null)
    or (new_category is not null and char_length(trim(new_category)) not between 1 and 100)
    or (select count(distinct x->>'id') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'Invalid selection' using errcode='22023'; end if;
  select name into actor from public.business_members where user_id=auth.uid() and business_id=target_id;
  for item in select value from jsonb_array_elements(items) order by value->>'id' loop
    select * into p from public.catalog_products where id=(item->>'id')::uuid and business_id=target_id for update;
    if not found then raise exception 'Product access denied' using errcode='42501'; end if;
    if (item->>'revision') is null or p.revision<>(item->>'revision')::integer then raise exception 'Product changed; reload' using errcode='PT409'; end if;
    old_row:=to_jsonb(p);
    update public.catalog_products set category=coalesce(trim(new_category),category),active=coalesce(new_active,active),revision=revision+1,updated_at=now() where id=p.id returning * into p;
    insert into public.catalog_audit(business_id,product_id,actor_id,actor_name,before_data,after_data) values(target_id,p.id,auth.uid(),actor,old_row,to_jsonb(p));
  end loop;
  result:=jsonb_build_object('count',jsonb_array_length(items));
  insert into public.catalog_requests(business_id,request_id,payload,response) values(target_id,operation_id,payload,result);
  return result;
end $$;
revoke all on function public.bulk_catalog_products(uuid,uuid,jsonb,text,boolean) from public;
grant execute on function public.bulk_catalog_products(uuid,uuid,jsonb,text,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
