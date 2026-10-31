begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid='public.businesses'::regclass
      and conname='businesses_category_check'
      and pg_get_constraintdef(oid) like '%category%store%'
  ) then
    raise exception 'Inspect the existing business category constraint before applying this migration';
  end if;
end $$;
alter table public.businesses drop constraint businesses_category_check;
alter table public.businesses add constraint businesses_category_check check(category in ('store','restaurant'));

create function public.create_business_profile_for_category(
  business_category text, store_name text, owner_name text, store_phone text,
  store_street text, store_city text, store_province text, store_description text
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if business_category is null or business_category not in ('store','restaurant') then
    raise exception 'Unsupported business category' using errcode='22023';
  end if;
  result:=public.create_business_profile(store_name,owner_name,store_phone,store_street,store_city,store_province,store_description);
  update public.businesses set category=business_category where id=result;
  return result;
end $$;
revoke all on function public.create_business_profile_for_category(text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_business_profile_for_category(text,text,text,text,text,text,text,text) to authenticated;

create function public.has_restaurant_access(target_id uuid, roles text[] default array['owner','admin','cashier'], allow_draft boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select public.has_business_access(target_id,roles) and exists (
    select 1 from public.businesses b where b.id=target_id and b.category='restaurant'
      and (b.onboarding_completed_at is not null or (allow_draft and public.has_business_access(target_id,array['owner'])))
  );
$$;
revoke all on function public.has_restaurant_access(uuid,text[],boolean) from public;
grant execute on function public.has_restaurant_access(uuid,text[],boolean) to authenticated;

create table public.restaurant_menu (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 100),
  category text not null check(char_length(category) between 1 and 100),
  price numeric not null check(price between 0 and 999999999999 and price=trunc(price)),
  available boolean not null default true,
  active boolean not null default true,
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id)
);
create index restaurant_menu_business on public.restaurant_menu(business_id,name,id);
create table public.restaurant_tables (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 60),
  capacity integer not null check(capacity between 1 and 1000),
  active boolean not null default true,
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  unique(business_id,id)
);
create unique index restaurant_table_name on public.restaurant_tables(business_id,lower(name));
create table public.restaurant_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(business_id,request_id)
);
create table public.restaurant_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  resource text not null,
  resource_id uuid not null,
  before_row jsonb,
  after_row jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.restaurant_menu enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.restaurant_requests enable row level security;
alter table public.restaurant_audit enable row level security;
revoke all on public.restaurant_menu,public.restaurant_tables,public.restaurant_requests,public.restaurant_audit from anon,authenticated;
grant select on public.restaurant_menu,public.restaurant_tables,public.restaurant_audit to authenticated;
grant all on public.restaurant_menu,public.restaurant_tables,public.restaurant_requests,public.restaurant_audit to service_role;
create policy menu_read on public.restaurant_menu for select to authenticated using (
  public.has_restaurant_access(business_id,array['owner','admin'],true)
  or (active and public.has_restaurant_access(business_id,array['cashier']))
);
create policy tables_read on public.restaurant_tables for select to authenticated using (
  public.has_restaurant_access(business_id,array['owner','admin'],true)
  or (active and public.has_restaurant_access(business_id,array['cashier']))
);
create policy restaurant_audit_read on public.restaurant_audit for select to authenticated using (
  public.has_restaurant_access(business_id,array['owner','admin'],true)
);

create function public.save_restaurant_resource(target_id uuid, resource text, item_id uuid, expected_revision integer, operation_id uuid, details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.restaurant_requests; payload jsonb; before_row jsonb; result jsonb;
  menu_row public.restaurant_menu; table_row public.restaurant_tables;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not public.has_restaurant_access(target_id,array['owner','admin'],true) then
    raise exception 'Restaurant management access denied' using errcode='42501';
  end if;
  if item_id is null or operation_id is null or resource is null or resource not in ('menu','table') then
    raise exception 'Invalid resource request' using errcode='22023';
  end if;
  payload:=jsonb_build_object('resource',resource,'id',item_id,'revision',expected_revision,'details',details);
  select * into prior from public.restaurant_requests where business_id=target_id and request_id=operation_id;
  if found then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
    return prior.response;
  end if;
  if details is null or jsonb_typeof(details)<>'object'
    or jsonb_typeof(details->'name') is distinct from 'string'
    or char_length(trim(details->>'name')) not between 1 and (case resource when 'menu' then 100 else 60 end)
    or jsonb_typeof(details->'active') is distinct from 'boolean' then
    raise exception 'Invalid resource details' using errcode='22023';
  end if;
  if resource='menu' then
    if details-array['name','category','price','available','active']<>'{}'::jsonb
      or jsonb_typeof(details->'category') is distinct from 'string' or char_length(trim(details->>'category')) not between 1 and 100
      or coalesce(details->>'price','') !~ '^(0|[1-9][0-9]{0,11})$'
      or jsonb_typeof(details->'available') is distinct from 'boolean' then
      raise exception 'Invalid menu details' using errcode='22023';
    end if;
    select * into menu_row from public.restaurant_menu where id=item_id for update;
    if found then
      if menu_row.business_id<>target_id then raise exception 'Menu access denied' using errcode='42501'; end if;
      if expected_revision is null or expected_revision<>menu_row.revision then raise exception 'Menu changed; reload' using errcode='PT409'; end if;
      before_row:=to_jsonb(menu_row);
      update public.restaurant_menu set name=trim(details->>'name'),category=trim(details->>'category'),price=(details->>'price')::numeric,
        available=(details->>'available')::boolean,active=(details->>'active')::boolean,revision=revision+1,updated_at=now()
        where id=item_id returning * into menu_row;
    else
      if expected_revision is not null then raise exception 'Menu missing; reload' using errcode='PT409'; end if;
      insert into public.restaurant_menu(id,business_id,name,category,price,available,active)
        values(item_id,target_id,trim(details->>'name'),trim(details->>'category'),(details->>'price')::numeric,(details->>'available')::boolean,(details->>'active')::boolean)
        returning * into menu_row;
    end if;
    result:=to_jsonb(menu_row);
  else
    if details-array['name','capacity','active']<>'{}'::jsonb or coalesce(details->>'capacity','') !~ '^[1-9][0-9]{0,3}$'
      or (details->>'capacity')::integer>1000 then raise exception 'Invalid table details' using errcode='22023'; end if;
    select * into table_row from public.restaurant_tables where id=item_id for update;
    if found then
      if table_row.business_id<>target_id then raise exception 'Table access denied' using errcode='42501'; end if;
      if expected_revision is null or expected_revision<>table_row.revision then raise exception 'Table changed; reload' using errcode='PT409'; end if;
      before_row:=to_jsonb(table_row);
      update public.restaurant_tables set name=trim(details->>'name'),capacity=(details->>'capacity')::integer,
        active=(details->>'active')::boolean,revision=revision+1 where id=item_id returning * into table_row;
    else
      if expected_revision is not null then raise exception 'Table missing; reload' using errcode='PT409'; end if;
      insert into public.restaurant_tables(id,business_id,name,capacity,active)
        values(item_id,target_id,trim(details->>'name'),(details->>'capacity')::integer,(details->>'active')::boolean) returning * into table_row;
    end if;
    result:=to_jsonb(table_row);
  end if;
  insert into public.restaurant_audit(business_id,actor_id,resource,resource_id,before_row,after_row)
    values(target_id,auth.uid(),resource,item_id,before_row,result);
  insert into public.restaurant_requests(business_id,request_id,actor_id,payload,response)
    values(target_id,operation_id,auth.uid(),payload,result);
  return result;
end $$;
revoke all on function public.save_restaurant_resource(uuid,text,uuid,integer,uuid,jsonb) from public;
grant execute on function public.save_restaurant_resource(uuid,text,uuid,integer,uuid,jsonb) to authenticated;

commit;
