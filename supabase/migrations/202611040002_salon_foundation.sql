begin;

alter table public.businesses drop constraint businesses_category_check;
alter table public.businesses add constraint businesses_category_check check(category in ('store','restaurant','barbershop'));

create or replace function public.create_business_profile_for_category(business_category text,store_name text,owner_name text,store_phone text,store_street text,store_city text,store_province text,store_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if business_category is null or business_category not in ('store','restaurant','barbershop') then raise exception 'Unsupported business category' using errcode='22023'; end if;
 result:=public.create_business_profile(store_name,owner_name,store_phone,store_street,store_city,store_province,store_description);
 update public.businesses set category=business_category where id=result;
 return result;
end $$;
revoke all on function public.create_business_profile_for_category(text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.create_business_profile_for_category(text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.create_business_profile_with_location(business_category text,store_name text,owner_name text,store_phone text,store_street text,store_city text,store_province text,store_description text,store_district text,store_village text)
returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid; current_revision integer;
begin
 if business_category is null or business_category not in ('store','restaurant','barbershop') then raise exception 'Unsupported business category' using errcode='22023'; end if;
 created_id:=public.create_business_profile_for_category(business_category,store_name,owner_name,store_phone,store_street,store_city,store_province,store_description);
 select profile_revision into current_revision from public.businesses where id=created_id;
 perform public.save_business_profile_with_location(created_id,current_revision,store_name,store_phone,store_street,store_city,store_province,store_description,store_district,store_village);
 return created_id;
end $$;
revoke all on function public.create_business_profile_with_location(text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.create_business_profile_with_location(text,text,text,text,text,text,text,text,text,text) to authenticated;

create function public.has_salon_access(target_id uuid,roles text[] default array['owner','admin','cashier'],allow_draft boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_business_access(target_id,roles) and exists(select 1 from public.businesses b where b.id=target_id and b.category='barbershop'
 and (b.onboarding_completed_at is not null or (allow_draft and public.has_business_access(target_id,array['owner']))));
$$;
revoke all on function public.has_salon_access(uuid,text[],boolean) from public,anon;
grant execute on function public.has_salon_access(uuid,text[],boolean) to authenticated,service_role;

create table public.salon_services(
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 100 and name=btrim(name)),
 price numeric not null check(price between 0 and 999999999999 and price=trunc(price)),
 duration_minutes integer not null check(duration_minutes between 1 and 720),
 active boolean not null,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,id)
);
create unique index salon_service_name on public.salon_services(business_id,lower(name));
create table public.salon_practitioners(
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 100 and name=btrim(name)),
 active boolean not null,
 schedule jsonb check(schedule is null or public.valid_business_hours(schedule)),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,id)
);
create unique index salon_practitioner_name on public.salon_practitioners(business_id,lower(name));
create table public.salon_practitioner_services(
 business_id uuid not null,
 practitioner_id uuid not null,
 service_id uuid not null,
 primary key(business_id,practitioner_id,service_id),
 foreign key(business_id,practitioner_id) references public.salon_practitioners(business_id,id) on delete cascade,
 foreign key(business_id,service_id) references public.salon_services(business_id,id) on delete cascade
);
create table public.salon_requests(
 business_id uuid not null references public.businesses(id) on delete cascade,
 request_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null,
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(business_id,request_id)
);
create table public.salon_audit(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 resource text not null check(resource in ('service','practitioner')),
 resource_id uuid not null,
 before_row jsonb,
 after_row jsonb not null,
 created_at timestamptz not null default now()
);
create index salon_audit_business on public.salon_audit(business_id,created_at,id);
alter table public.salon_services enable row level security;
alter table public.salon_practitioners enable row level security;
alter table public.salon_practitioner_services enable row level security;
alter table public.salon_requests enable row level security;
alter table public.salon_audit enable row level security;
revoke all on public.salon_services,public.salon_practitioners,public.salon_practitioner_services,public.salon_requests,public.salon_audit from anon,authenticated;
grant select on public.salon_services,public.salon_practitioners,public.salon_practitioner_services,public.salon_audit to authenticated;
grant all on public.salon_services,public.salon_practitioners,public.salon_practitioner_services,public.salon_requests,public.salon_audit to service_role;
create policy salon_services_read on public.salon_services for select to authenticated using(public.has_salon_access(business_id,array['owner','admin'],true) or (active and public.has_salon_access(business_id,array['cashier'])));
create policy salon_practitioners_read on public.salon_practitioners for select to authenticated using(public.has_salon_access(business_id,array['owner','admin'],true) or (active and public.has_salon_access(business_id,array['cashier'])));
create policy salon_skills_read on public.salon_practitioner_services for select to authenticated using(public.has_salon_access(business_id,array['owner','admin'],true) or (public.has_salon_access(business_id,array['cashier']) and exists(select 1 from public.salon_services s where s.business_id=salon_practitioner_services.business_id and s.id=service_id and s.active) and exists(select 1 from public.salon_practitioners p where p.business_id=salon_practitioner_services.business_id and p.id=practitioner_id and p.active)));
create policy salon_audit_read on public.salon_audit for select to authenticated using(public.has_salon_access(business_id,array['owner','admin'],true));

create function public.save_salon_resource(target_id uuid,resource text,item_id uuid,expected_revision integer,operation_id uuid,details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.salon_requests; payload jsonb; before_row jsonb; result jsonb; service_ids uuid[]; p public.salon_practitioners; s public.salon_services;
begin
 perform 1 from public.businesses where id=target_id for update;
 if not found or not public.has_salon_access(target_id,array['owner','admin'],true) then raise exception 'Salon management access denied' using errcode='42501'; end if;
 if resource is null or resource not in ('service','practitioner') or item_id is null or operation_id is null or expected_revision<1 then raise exception 'Invalid salon request' using errcode='22023'; end if;
 payload:=jsonb_build_object('resource',resource,'id',item_id,'revision',expected_revision,'details',details);
 select * into prior from public.salon_requests where business_id=target_id and request_id=operation_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request ID already used' using errcode='22023'; end if;
  return prior.response;
 end if;
 if details is null or jsonb_typeof(details)<>'object' or jsonb_typeof(details->'name') is distinct from 'string' or char_length(btrim(details->>'name')) not between 1 and 100 or jsonb_typeof(details->'active') is distinct from 'boolean' then raise exception 'Invalid salon details' using errcode='22023'; end if;
 if resource='service' then
  if details-array['name','price','duration','active']<>'{}'::jsonb or coalesce(details->>'price','')!~'^(0|[1-9][0-9]{0,11})$' or coalesce(details->>'duration','')!~'^[1-9][0-9]{0,2}$' or (details->>'duration')::integer>720 then raise exception 'Invalid salon service' using errcode='22023'; end if;
  select * into s from public.salon_services where business_id=target_id and id=item_id for update;
  if (expected_revision is null and s.id is not null) or (expected_revision is not null and (s.id is null or s.revision<>expected_revision)) then raise exception 'Salon resource changed' using errcode='PT409'; end if;
  before_row:=case when s.id is null then null else to_jsonb(s) end;
  if s.id is null then
   if (select count(*) from public.salon_services where business_id=target_id)>=5000 then raise exception 'Salon service limit reached' using errcode='54000'; end if;
   insert into public.salon_services(id,business_id,name,price,duration_minutes,active) values(item_id,target_id,btrim(details->>'name'),(details->>'price')::numeric,(details->>'duration')::integer,(details->>'active')::boolean) returning * into s;
  else
   update public.salon_services set name=btrim(details->>'name'),price=(details->>'price')::numeric,duration_minutes=(details->>'duration')::integer,active=(details->>'active')::boolean,revision=revision+1,updated_at=now() where business_id=target_id and id=item_id returning * into s;
  end if;
  result:=to_jsonb(s);
 else
  if details-array['name','active','serviceIds','schedule']<>'{}'::jsonb or jsonb_typeof(details->'serviceIds') is distinct from 'array' or jsonb_array_length(details->'serviceIds')>100 or not(details?'schedule') then raise exception 'Invalid salon practitioner' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(details->'serviceIds') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid salon services' using errcode='22023'; end if;
  select coalesce(array_agg(v::uuid order by v),'{}'::uuid[]) into service_ids from jsonb_array_elements_text(details->'serviceIds') v;
  if (select count(distinct v) from unnest(service_ids) v)<>cardinality(service_ids) or (select count(*) from public.salon_services where business_id=target_id and id=any(service_ids))<>cardinality(service_ids) then raise exception 'Invalid salon services' using errcode='22023'; end if;
  if details->'schedule'<>'null'::jsonb and not public.valid_business_hours(details->'schedule') then raise exception 'Invalid salon schedule' using errcode='22023'; end if;
  select * into p from public.salon_practitioners where business_id=target_id and id=item_id for update;
  if (expected_revision is null and p.id is not null) or (expected_revision is not null and (p.id is null or p.revision<>expected_revision)) then raise exception 'Salon resource changed' using errcode='PT409'; end if;
  before_row:=case when p.id is null then null else to_jsonb(p)||jsonb_build_object('service_ids',(select coalesce(jsonb_agg(service_id order by service_id),'[]') from public.salon_practitioner_services where business_id=target_id and practitioner_id=item_id)) end;
  if p.id is null then
   if (select count(*) from public.salon_practitioners where business_id=target_id)>=1000 then raise exception 'Salon practitioner limit reached' using errcode='54000'; end if;
   insert into public.salon_practitioners(id,business_id,name,active,schedule) values(item_id,target_id,btrim(details->>'name'),(details->>'active')::boolean,nullif(details->'schedule','null'::jsonb)) returning * into p;
  else
   update public.salon_practitioners set name=btrim(details->>'name'),active=(details->>'active')::boolean,schedule=nullif(details->'schedule','null'::jsonb),revision=revision+1,updated_at=now() where business_id=target_id and id=item_id returning * into p;
  end if;
  delete from public.salon_practitioner_services where business_id=target_id and practitioner_id=item_id;
  insert into public.salon_practitioner_services(business_id,practitioner_id,service_id) select target_id,item_id,v from unnest(service_ids) v;
  result:=to_jsonb(p)||jsonb_build_object('service_ids',service_ids);
 end if;
 insert into public.salon_audit(business_id,actor_id,resource,resource_id,before_row,after_row) values(target_id,auth.uid(),resource,item_id,before_row,result);
 insert into public.salon_requests(business_id,request_id,actor_id,payload,response) values(target_id,operation_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.save_salon_resource(uuid,text,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.save_salon_resource(uuid,text,uuid,integer,uuid,jsonb) to authenticated;

create function public.read_salon_foundation(target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manage boolean; services jsonb; practitioners jsonb;
begin
 if not public.has_salon_access(target_id,array['owner','admin','cashier'],true) then raise exception 'Salon access denied' using errcode='42501'; end if;
 manage:=public.has_salon_access(target_id,array['owner','admin'],true);
 if (select count(*) from public.salon_services where business_id=target_id and (manage or active))>5000 or (select count(*) from public.salon_practitioners where business_id=target_id and (manage or active))>1000 then raise exception 'Salon read limit exceeded' using errcode='54000'; end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by lower(name),id),'[]') into services from public.salon_services s where business_id=target_id and (manage or active);
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('service_ids',(select coalesce(jsonb_agg(ps.service_id order by ps.service_id),'[]') from public.salon_practitioner_services ps join public.salon_services s on s.business_id=ps.business_id and s.id=ps.service_id where ps.business_id=target_id and ps.practitioner_id=p.id and (manage or s.active))) order by lower(p.name),p.id),'[]') into practitioners from public.salon_practitioners p where business_id=target_id and (manage or active);
 return jsonb_build_object('services',services,'practitioners',practitioners);
end $$;
revoke all on function public.read_salon_foundation(uuid) from public,anon;
grant execute on function public.read_salon_foundation(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
