begin;

create table public.restaurant_orders (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  kind text not null check(kind in ('dine_in','takeaway')),
  table_id uuid,
  table_name text,
  guests integer not null check(guests between 1 and 1000),
  customer text not null check(char_length(customer) between 1 and 100),
  notes text not null default '' check(char_length(notes)<=300),
  lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 100),
  subtotal numeric not null check(subtotal between 0 and 999999999999 and subtotal=trunc(subtotal)),
  status text not null default 'open' check(status in ('open','paid','cancelled')),
  stage text not null default 'new' check(stage in ('new','preparing','ready','served')),
  revision integer not null default 0 check(revision>=0),
  sale_id uuid,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id),
  foreign key(business_id,table_id) references public.restaurant_tables(business_id,id),
  foreign key(business_id,sale_id) references public.pos_transactions(business_id,id),
  check((kind='dine_in' and table_id is not null and table_name is not null) or (kind='takeaway' and table_id is null and table_name is null)),
  check(status<>'paid' or sale_id is not null),
  check(status<>'cancelled' or char_length(cancellation_reason) between 3 and 300)
);
create unique index restaurant_one_open_table on public.restaurant_orders(business_id,table_id) where status='open' and table_id is not null;
create unique index restaurant_one_sale on public.restaurant_orders(sale_id) where sale_id is not null;
create index restaurant_order_history on public.restaurant_orders(business_id,created_at desc,id);
alter table public.restaurant_orders enable row level security;
revoke all on public.restaurant_orders from anon,authenticated;
grant select on public.restaurant_orders to authenticated;
grant all on public.restaurant_orders to service_role;
create policy restaurant_orders_read on public.restaurant_orders for select to authenticated using (
  public.has_restaurant_access(business_id,array['owner','admin']) or (
    public.has_restaurant_access(business_id,array['cashier']) and actor_id=auth.uid()
    and (sale_id is null or exists(select 1 from public.pos_transactions s where s.id=sale_id and s.actor_id=auth.uid()))
  )
);

create function public.restaurant_table_usage(target_id uuid) returns table(id uuid,occupied boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
  return query select t.id,exists(select 1 from public.restaurant_orders o where o.business_id=target_id and o.table_id=t.id and o.status='open')
    from public.restaurant_tables t where t.business_id=target_id and t.active;
end $$;
revoke all on function public.restaurant_table_usage(uuid) from public;
grant execute on function public.restaurant_table_usage(uuid) to authenticated;

create function public.protect_occupied_restaurant_table() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.restaurant_orders where business_id=new.business_id and table_id=new.id and status='open' and (not new.active or guests>new.capacity)) then
    raise exception 'Table has an open order; keep it active and sufficient capacity' using errcode='PT409';
  end if;
  return new;
end $$;
revoke all on function public.protect_occupied_restaurant_table() from public;
create trigger restaurant_occupied_table before update on public.restaurant_tables for each row execute function public.protect_occupied_restaurant_table();

create function public.save_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.restaurant_orders; old_row jsonb; t public.restaurant_tables; m public.restaurant_menu;
  actor public.business_members; prior public.restaurant_requests; payload jsonb; line jsonb; old_line jsonb;
  snapshot jsonb:='[]'; amount integer; price numeric; order_subtotal numeric:=0; result jsonb;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id) then raise exception 'Restaurant access denied' using errcode='42501'; end if;
  select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('resource','order','id',item_id,'revision',expected_revision,'details',details);
  select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
    return prior.response;
  end if;
  select * into o from public.restaurant_orders where id=item_id for update;
  if found then
    if o.business_id<>target_id or (actor.role='cashier' and o.actor_id is distinct from auth.uid()) then raise exception 'Order access denied' using errcode='42501'; end if;
    if o.status<>'open' or expected_revision is null or expected_revision<>o.revision then raise exception 'Order changed; reload' using errcode='PT409'; end if;
    old_row:=to_jsonb(o);
  elsif expected_revision is not null then raise exception 'Order missing; reload' using errcode='PT409'; end if;
  if details is null or jsonb_typeof(details)<>'object'
    or details-array['kind','tableId','guests','customer','notes','stage','lines']<>'{}'::jsonb
    or coalesce(details->>'kind','') not in ('dine_in','takeaway')
    or coalesce(details->>'guests','') !~ '^[1-9][0-9]{0,3}$' or (details->>'guests')::integer>1000
    or jsonb_typeof(details->'customer') is distinct from 'string' or char_length(trim(details->>'customer')) not between 1 and 100
    or jsonb_typeof(details->'notes') is distinct from 'string' or char_length(details->>'notes')>300
    or coalesce(details->>'stage','') not in ('new','preparing','ready','served')
    or jsonb_typeof(details->'lines') is distinct from 'array' or jsonb_array_length(details->'lines') not between 1 and 100 then
    raise exception 'Invalid order' using errcode='22023';
  end if;
  if (old_row is null and details->>'stage'<>'new') or (old_row is not null and array_position(array['new','preparing','ready','served'],details->>'stage')<array_position(array['new','preparing','ready','served'],o.stage)) then
    raise exception 'Invalid order stage' using errcode='22023';
  end if;
  if details->>'kind'='dine_in' then
    select * into t from public.restaurant_tables where id=(details->>'tableId')::uuid and business_id=target_id for update;
    if not found or not t.active or t.capacity<(details->>'guests')::integer then raise exception 'Table unavailable or insufficient capacity' using errcode='PT409'; end if;
    if exists(select 1 from public.restaurant_orders where business_id=target_id and table_id=t.id and status='open' and id<>item_id) then raise exception 'Table already occupied' using errcode='PT409'; end if;
  elsif details->'tableId' is distinct from 'null'::jsonb then raise exception 'Takeaway has no table' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(details->'lines'))<>jsonb_array_length(details->'lines') then raise exception 'Duplicate menu item' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(details->'lines') order by value->>'id' loop
    if jsonb_typeof(line)<>'object' or line-array['id','quantity']<>'{}'::jsonb or coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Invalid menu quantity' using errcode='22023'; end if;
    amount:=(line->>'quantity')::integer;
    select * into m from public.restaurant_menu where id=(line->>'id')::uuid and business_id=target_id for update;
    if not found then raise exception 'Menu unavailable' using errcode='PT409'; end if;
    old_line:=null;
    if old_row is not null then select value into old_line from jsonb_array_elements(o.lines) where value->>'id'=line->>'id'; end if;
    if old_line is not null and amount<=(old_line->>'quantity')::integer then
      price:=(old_line->>'price')::numeric;
      snapshot:=snapshot||jsonb_build_array(old_line||jsonb_build_object('quantity',amount,'total',price*amount));
    else
      if not m.active or not m.available then raise exception 'Menu unavailable' using errcode='PT409'; end if;
      price:=m.price;
      snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',m.id,'name',m.name,'sku','','unit','porsi','price',price,'quantity',amount,'total',price*amount));
    end if;
    order_subtotal:=order_subtotal+price*amount;
    if order_subtotal>999999999999 then raise exception 'Total exceeds limit' using errcode='22023'; end if;
  end loop;
  if old_row is null then
    insert into public.restaurant_orders(id,business_id,actor_id,actor_name,kind,table_id,table_name,guests,customer,notes,lines,subtotal)
      values(item_id,target_id,auth.uid(),actor.name,details->>'kind',t.id,t.name,(details->>'guests')::integer,trim(details->>'customer'),trim(details->>'notes'),snapshot,order_subtotal) returning * into o;
  else
    update public.restaurant_orders set kind=details->>'kind',table_id=t.id,table_name=t.name,guests=(details->>'guests')::integer,
      customer=trim(details->>'customer'),notes=trim(details->>'notes'),lines=snapshot,subtotal=order_subtotal,
      stage=details->>'stage',revision=revision+1,updated_at=now() where id=item_id returning * into o;
  end if;
  result:=to_jsonb(o);
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'order',item_id,old_row,result);
  insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
  return result;
end $$;
revoke all on function public.save_restaurant_order(uuid,uuid,integer,uuid,jsonb) from public;
grant execute on function public.save_restaurant_order(uuid,uuid,integer,uuid,jsonb) to authenticated;

create function public.pay_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,operation_id uuid,details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.restaurant_orders; old_row jsonb; sale public.pos_transactions; actor public.business_members;
  prior public.restaurant_requests; payload jsonb; result jsonb; discount_kind text; payment text; discount_value numeric; discount numeric; total numeric; received numeric;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id) then raise exception 'Payment access denied' using errcode='42501'; end if;
  select * into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  if item_id is null or operation_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('resource','payment','id',item_id,'revision',expected_revision,'details',details);
  select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
    select * into sale from public.pos_transactions where id=(prior.response->'sale'->>'id')::uuid;
    select * into o from public.restaurant_orders where id=item_id;
    return jsonb_build_object('order',to_jsonb(o),'sale',to_jsonb(sale));
  end if;
  select * into o from public.restaurant_orders where id=item_id and business_id=target_id for update;
  if not found or (actor.role='cashier' and o.actor_id is distinct from auth.uid()) then raise exception 'Order access denied' using errcode='42501'; end if;
  if o.status<>'open' or expected_revision is null or o.revision<>expected_revision then raise exception 'Order changed; reload' using errcode='PT409'; end if;
  old_row:=to_jsonb(o);
  if details is null or jsonb_typeof(details)<>'object' or details-array['payment','received','discountKind','discountValue','confirmed']<>'{}'::jsonb
    or details->'confirmed' is distinct from 'true'::jsonb or coalesce(details->>'payment','') not in ('cash','qris','transfer')
    or coalesce(details->>'discountKind','') not in ('none','amount','percent')
    or coalesce(details->>'discountValue','') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    or coalesce(details->>'received','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'Invalid payment' using errcode='22023'; end if;
  discount_kind:=details->>'discountKind'; discount_value:=(details->>'discountValue')::numeric; payment:=details->>'payment'; received:=(details->>'received')::numeric;
  if (discount_kind='none' and discount_value<>0) or (discount_kind='amount' and discount_value<>trunc(discount_value)) or (discount_kind='percent' and discount_value>100) then raise exception 'Invalid discount' using errcode='22023'; end if;
  if discount_kind<>'none' and actor.role='cashier' then raise exception 'Discount access denied' using errcode='42501'; end if;
  discount:=case discount_kind when 'amount' then discount_value when 'percent' then round(o.subtotal*discount_value/100,0) else 0 end;
  if discount>o.subtotal then raise exception 'Discount exceeds subtotal' using errcode='22023'; end if;
  total:=o.subtotal-discount;
  if received<total or received>999999999999 or (payment<>'cash' and received<>total) then raise exception 'Invalid received amount' using errcode='22023'; end if;
  insert into public.pos_transactions(business_id,actor_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change)
    values(target_id,auth.uid(),actor.name,o.customer,o.lines,o.subtotal,discount_kind,discount_value,discount,total,payment,received,received-total) returning * into sale;
  update public.restaurant_orders set status='paid',sale_id=sale.id,revision=revision+1,updated_at=now() where id=item_id returning * into o;
  result:=jsonb_build_object('order',to_jsonb(o),'sale',to_jsonb(sale));
  insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'payment',item_id,old_row,to_jsonb(o));
  return result;
end $$;
revoke all on function public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb) from public;
grant execute on function public.pay_restaurant_order(uuid,uuid,integer,uuid,jsonb) to authenticated;

create function public.cancel_restaurant_order(target_id uuid,item_id uuid,expected_revision integer,explanation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.restaurant_orders; old_row jsonb;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id) then raise exception 'Order access denied' using errcode='42501'; end if;
  select * into o from public.restaurant_orders where id=item_id and business_id=target_id for update;
  if not found or not (public.has_business_access(target_id,array['owner','admin']) or o.actor_id=auth.uid()) then raise exception 'Order access denied' using errcode='42501'; end if;
  if o.status='cancelled' and o.sale_id is null then return to_jsonb(o); end if;
  if o.status<>'open' or expected_revision is null or o.revision<>expected_revision then raise exception 'Order changed; reload' using errcode='PT409'; end if;
  if explanation is null or char_length(trim(explanation)) not between 3 and 300 then raise exception 'Cancellation reason required' using errcode='22023'; end if;
  old_row:=to_jsonb(o);
  update public.restaurant_orders set status='cancelled',cancellation_reason=trim(explanation),revision=revision+1,updated_at=now() where id=item_id returning * into o;
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'cancel_order',item_id,old_row,to_jsonb(o));
  return to_jsonb(o);
end $$;
revoke all on function public.cancel_restaurant_order(uuid,uuid,integer,text) from public;
grant execute on function public.cancel_restaurant_order(uuid,uuid,integer,text) to authenticated;

create function public.cancel_restaurant_sale(target_id uuid,sale_id uuid,explanation text,goods_returned boolean,refund_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sale public.pos_transactions; o public.restaurant_orders; actor text; old_row jsonb;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id,array['owner','admin']) then raise exception 'Cancellation access denied' using errcode='42501'; end if;
  select * into o from public.restaurant_orders where business_id=target_id and restaurant_orders.sale_id=cancel_restaurant_sale.sale_id for update;
  if not found then raise exception 'Sale access denied' using errcode='42501'; end if;
  select * into sale from public.pos_transactions where id=cancel_restaurant_sale.sale_id and business_id=target_id for update;
  if not found then raise exception 'Sale access denied' using errcode='42501'; end if;
  if sale.status='cancelled' then return to_jsonb(sale); end if;
  if explanation is null or char_length(trim(explanation)) not between 3 and 300 or goods_returned is distinct from true or refund_confirmed is distinct from true then raise exception 'Confirm cancellation and manual refund' using errcode='22023'; end if;
  select name into actor from public.business_members where business_id=target_id and user_id=auth.uid();
  old_row:=to_jsonb(o);
  update public.pos_transactions set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancelled_by_name=actor,cancellation_reason=trim(explanation),refund_amount=total where id=sale.id returning * into sale;
  update public.restaurant_orders set status='cancelled',cancellation_reason=trim(explanation),revision=revision+1,updated_at=now() where id=o.id returning * into o;
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),'refund',o.id,old_row,to_jsonb(o));
  return to_jsonb(sale);
end $$;
revoke all on function public.cancel_restaurant_sale(uuid,uuid,text,boolean,boolean) from public;
grant execute on function public.cancel_restaurant_sale(uuid,uuid,text,boolean,boolean) to authenticated;

create or replace function public.read_sales_report(target_id uuid,from_ts timestamptz,to_ts timestamptz,payment_method text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sales jsonb; refunds jsonb; sale_count bigint; refund_count bigint;
begin
  if not public.has_business_access(target_id,array['owner','admin'])
    or not exists(select 1 from public.businesses where id=target_id and category in ('store','restaurant') and onboarding_completed_at is not null) then
    raise exception 'Report access denied' using errcode='42501';
  end if;
  if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts)
    or to_ts<=from_ts or to_ts-from_ts>interval '366 days'
    or (from_ts at time zone 'Asia/Jakarta')::time<>'00:00:00'::time
    or (to_ts at time zone 'Asia/Jakarta')::time<>'00:00:00'::time
    or payment_method is null or payment_method not in ('all','cash','qris','transfer') then raise exception 'Invalid report range or payment' using errcode='22023'; end if;
  select count(*) into sale_count from public.pos_transactions where business_id=target_id and created_at>=from_ts and created_at<to_ts and (payment_method='all' or payment=payment_method);
  select count(*) into refund_count from public.pos_transactions where business_id=target_id and status='cancelled' and cancelled_at>=from_ts and cancelled_at<to_ts and (payment_method='all' or payment=payment_method);
  if sale_count>20000 or refund_count>20000 then raise exception 'Report too large; narrow date range' using errcode='PT413'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id),'[]'::jsonb) into sales from public.pos_transactions s where s.business_id=target_id and s.created_at>=from_ts and s.created_at<to_ts and (payment_method='all' or s.payment=payment_method);
  select coalesce(jsonb_agg(to_jsonb(s) order by s.cancelled_at desc,s.id),'[]'::jsonb) into refunds from public.pos_transactions s where s.business_id=target_id and s.status='cancelled' and s.cancelled_at>=from_ts and s.cancelled_at<to_ts and (payment_method='all' or s.payment=payment_method);
  return jsonb_build_object('sales',sales,'refunds',refunds,'generatedAt',statement_timestamp());
end $$;

commit;
