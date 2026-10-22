begin;

create table public.pos_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  customer text not null,
  lines jsonb not null check(jsonb_typeof(lines)='array'),
  subtotal numeric not null check(subtotal between 0 and 999999999999),
  discount_kind text not null check(discount_kind in ('none','amount','percent')),
  discount_value numeric not null,
  discount numeric not null check(discount between 0 and subtotal),
  total numeric not null check(total=subtotal-discount),
  payment text not null check(payment in ('cash','qris','transfer')),
  received numeric not null check(received>=total and received=trunc(received) and received<=999999999999),
  change numeric not null check(change=received-total),
  status text not null default 'completed' check(status in ('completed','cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_name text,
  cancellation_reason text,
  refund_amount numeric,
  unique(business_id,id),
  check((status='completed' and cancelled_at is null and refund_amount is null) or
        (status='cancelled' and cancelled_at is not null and char_length(cancellation_reason) between 3 and 300 and refund_amount=total))
);
create index pos_history on public.pos_transactions(business_id,created_at desc,id);
create index pos_cashier_history on public.pos_transactions(business_id,actor_id,created_at desc);
create table public.pos_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  primary key(business_id,request_id)
);
alter table public.pos_transactions enable row level security;
alter table public.pos_requests enable row level security;
revoke all on public.pos_transactions,public.pos_requests from anon,authenticated;
grant select on public.pos_transactions to authenticated;
grant all on public.pos_transactions,public.pos_requests to service_role;
create policy pos_read on public.pos_transactions for select to authenticated using (
  public.has_business_access(business_id,array['owner','admin']) or
  (actor_id=auth.uid() and public.has_business_access(business_id,array['cashier']))
);
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check check(kind in ('initial','in','out','adjustment','sale','sale_cancel'));
alter table public.stock_movements add column sale_id uuid;
alter table public.stock_movements add constraint stock_sale_business_fk foreign key(business_id,sale_id) references public.pos_transactions(business_id,id) on delete cascade;
create unique index stock_sale_once on public.stock_movements(sale_id,product_id,kind) where sale_id is not null;

create function public.checkout_pos(target_id uuid,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.business_members; p public.catalog_products; prior public.pos_requests; sale public.pos_transactions;
  line jsonb; snapshot jsonb:='[]'; amount numeric; line_total numeric; subtotal numeric:=0; discount numeric:=0;
  discount_value numeric; total numeric; received numeric; discount_kind text; payment text;
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
  if details is null or jsonb_typeof(details)<>'object' or details-array['lines','payment','received','discountKind','discountValue','customer','confirmed']<>'{}'::jsonb
    or details->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(details->'lines') is distinct from 'array'
    or jsonb_array_length(details->'lines') not between 1 and 100
    or jsonb_typeof(details->'customer') is distinct from 'string' or char_length(trim(details->>'customer')) not between 1 and 100 then
    raise exception 'Invalid checkout' using errcode='22023'; end if;
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
  insert into public.pos_transactions(business_id,actor_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change)
    values(target_id,auth.uid(),actor.name,trim(details->>'customer'),snapshot,subtotal,discount_kind,discount_value,discount,total,payment,received,received-total) returning * into sale;
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

create function public.cancel_pos(target_id uuid,sale_id uuid,explanation text,goods_returned boolean,refund_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sale public.pos_transactions; p public.catalog_products; line jsonb; amount numeric; actor text;
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
      values(target_id,p.id,gen_random_uuid(),'sale_cancel',amount,p.stock,p.stock+amount,line->>'name',line->>'unit',trim(explanation),auth.uid(),actor,sale.id);
  end loop;
  update public.pos_transactions set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancelled_by_name=actor,cancellation_reason=trim(explanation),refund_amount=total where id=sale.id returning * into sale;
  return to_jsonb(sale);
end $$;
revoke all on function public.cancel_pos(uuid,uuid,text,boolean,boolean) from public;
grant execute on function public.cancel_pos(uuid,uuid,text,boolean,boolean) to authenticated;
commit;
