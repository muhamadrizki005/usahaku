begin;

create function public.read_restaurant_orders_page(target_id uuid, order_status text default 'open', search_text text default '', requested_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; total bigint; page integer; needle text;
begin
  if not public.has_restaurant_access(target_id) then raise exception 'Order access denied' using errcode='42501'; end if;
  if order_status is null or order_status not in ('open','paid','cancelled','all')
    or search_text is null or char_length(search_text)>100
    or requested_page is null or requested_page<0 or requested_page>1000000 then
    raise exception 'Invalid order filters' using errcode='22023';
  end if;
  needle:=lower(trim(search_text));
  select count(*) into total from public.restaurant_orders o
    where o.business_id=target_id and (order_status='all' or o.status=order_status)
      and (needle='' or strpos(lower('PSN-'||left(o.id::text,8)),needle)>0
        or strpos(lower(o.customer),needle)>0 or strpos(lower(coalesce(o.table_name,'')),needle)>0 or strpos(lower(o.actor_name),needle)>0);
  page:=least(requested_page,greatest(0,(total-1)/25)::integer);
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc),'[]'::jsonb) into result from (
    select o.* from public.restaurant_orders o
      where o.business_id=target_id and (order_status='all' or o.status=order_status)
        and (needle='' or strpos(lower('PSN-'||left(o.id::text,8)),needle)>0
          or strpos(lower(o.customer),needle)>0 or strpos(lower(coalesce(o.table_name,'')),needle)>0 or strpos(lower(o.actor_name),needle)>0)
      order by o.created_at desc,o.id desc limit 25 offset page*25
  ) p;
  return jsonb_build_object('orders',result,'total',total,'page',page,'pageSize',25);
end $$;
revoke all on function public.read_restaurant_orders_page(uuid,text,text,integer) from public;
grant execute on function public.read_restaurant_orders_page(uuid,text,text,integer) to authenticated;

create function public.read_restaurant_overview(target_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare day_start timestamptz; day_end timestamptz; revenue numeric; sale_count bigint;
  open_count bigint; occupied_count bigint; menu_count bigint; table_count bigint; recent jsonb;
begin
  if not public.has_restaurant_access(target_id,array['owner','admin']) then raise exception 'Overview access denied' using errcode='42501'; end if;
  day_start:=date_trunc('day',statement_timestamp() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  day_end:=day_start+interval '24 hours';
  select coalesce(sum(s.total),0),count(*) into revenue,sale_count from public.pos_transactions s
    where s.business_id=target_id and s.status='completed' and s.created_at>=day_start and s.created_at<day_end;
  select count(*),count(o.table_id) into open_count,occupied_count from public.restaurant_orders o where o.business_id=target_id and o.status='open';
  select count(*) into menu_count from public.restaurant_menu m where m.business_id=target_id and m.active and m.available;
  select count(*) into table_count from public.restaurant_tables t where t.business_id=target_id and t.active;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc),'[]'::jsonb) into recent from (
    select o.id,o.table_name,o.stage,o.subtotal,o.created_at from public.restaurant_orders o
      where o.business_id=target_id and o.status='open' order by o.created_at desc,o.id desc limit 10
  ) p;
  return jsonb_build_object('revenue',revenue,'saleCount',sale_count,'openCount',open_count,'occupiedCount',occupied_count,'menuCount',menu_count,'tableCount',table_count,'recent',recent);
end $$;
revoke all on function public.read_restaurant_overview(uuid) from public;
grant execute on function public.read_restaurant_overview(uuid) to authenticated;

create index restaurant_order_status_history on public.restaurant_orders(business_id,status,created_at desc,id desc);

commit;
