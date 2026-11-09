begin;

create or replace function public.search_pos_customer_options(target_id uuid, term text)
returns table(id uuid, name text, phone text, points bigint)
language plpgsql stable security definer set search_path='' as $$
declare query text; digits text;
begin
  if not public.has_business_permission(target_id,'pos:view') then
    raise exception 'Customer access denied' using errcode='42501';
  end if;
  if term is null then return; end if;
  query:=lower(trim(term));
  if char_length(query)>100 then return; end if;
  digits:=regexp_replace(query,'[^0-9]','','g');
  if left(digits,1)='0' and char_length(digits)>1 then digits:='62'||substr(digits,2); end if;
  return query select c.id,c.name,c.phone,c.points::bigint from public.customers c
    where c.business_id=target_id and c.active and (
      query='' or position(query in lower(c.name))>0 or
      (digits<>'' and query ~ '^\+?[0-9 ()-]+$' and position(digits in c.phone)>0)
    ) order by lower(c.name),c.id limit 20;
end $$;
revoke all on function public.search_pos_customer_options(uuid,text) from public,anon;
grant execute on function public.search_pos_customer_options(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
