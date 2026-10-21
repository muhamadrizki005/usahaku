-- Stage 3 only. Run once AFTER the existing foundation migration; no reset or demo seed.
begin;

alter table public.businesses
  add column street_address text not null default '' check (char_length(street_address) <= 300),
  add column city text not null default '' check (char_length(city) <= 100),
  add column province text not null default '' check (char_length(province) <= 100),
  add column description text not null default '' check (char_length(description) <= 300),
  add column logo_path text,
  add column profile_revision integer not null default 0 check (profile_revision >= 0),
  add column operating_hours jsonb,
  add column hours_revision integer not null default 0 check (hours_revision >= 0);

-- One interval per start day, in Asia/Jakarta. End <= start is next day;
-- equal endpoints are rejected (24h opening is deliberately not implicit).
create function public.valid_business_hours(schedule jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  day_names text[] := array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
  starts integer[] := '{}'; ends integer[] := '{}'; item jsonb;
  opening integer; closing integer; i integer; j integer; shift integer;
begin
  if schedule is null or jsonb_typeof(schedule) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(schedule)) <> 7 then return false; end if;
  for i in 1..7 loop
    item := schedule -> day_names[i];
    if item is null or jsonb_typeof(item) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item)) <> 3
      or jsonb_typeof(item->'closed') is distinct from 'boolean'
      or jsonb_typeof(item->'open') is distinct from 'string' or jsonb_typeof(item->'close') is distinct from 'string'
      or not (item->>'open' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      or not (item->>'close' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false; end if;
    if not (item->>'closed')::boolean then
      opening := split_part(item->>'open', ':', 1)::integer * 60 + split_part(item->>'open', ':', 2)::integer;
      closing := split_part(item->>'close', ':', 1)::integer * 60 + split_part(item->>'close', ':', 2)::integer;
      if opening = closing then return false; end if;
      starts := array_append(starts, (i-1)*1440 + opening);
      ends := array_append(ends, (i-1)*1440 + closing + case when closing < opening then 1440 else 0 end);
    end if;
  end loop;
  if coalesce(array_length(starts, 1), 0) = 0 then return false; end if;
  for i in 1..array_length(starts, 1) loop
    for j in i+1..array_length(starts, 1) loop
      foreach shift in array array[-10080,0,10080] loop
        if greatest(starts[i], starts[j]+shift) < least(ends[i], ends[j]+shift) then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_business_hours(jsonb) from public;
grant execute on function public.valid_business_hours(jsonb) to authenticated, service_role;
alter table public.businesses add constraint business_hours_valid
  check (operating_hours is null or public.valid_business_hours(operating_hours));

create table public.business_logo_assets (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  path text not null unique,
  state text not null default 'staging' check (state in ('staging','active','retired','deleting','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (path = business_id::text || '/' || id::text || '.png')
);
create index business_logo_cleanup on public.business_logo_assets(state, created_at);
alter table public.business_logo_assets enable row level security;
revoke all on public.business_logo_assets from anon, authenticated;
grant all on public.business_logo_assets to service_role;
alter table public.businesses add constraint business_logo_path_valid
  check (logo_path is null or left(logo_path,37) = id::text || '/');
alter table public.businesses add constraint business_logo_reference
  foreign key (logo_path) references public.business_logo_assets(path) deferrable initially deferred;

-- Force writes through scoped, version-checked functions. Existing read policies stay intact.
revoke update(name, phone, address) on public.businesses from authenticated;

create function public.save_business_profile(
  target_id uuid, expected_revision integer, new_name text, new_phone text,
  new_street text, new_city text, new_province text, new_description text
) returns public.businesses language plpgsql security definer set search_path = '' as $$
declare current_row public.businesses; full_address text;
begin
  if not public.has_business_access(target_id, array['owner']) then raise exception 'Business access denied' using errcode='42501'; end if;
  select * into current_row from public.businesses where id=target_id for update;
  if expected_revision is null or current_row.profile_revision <> expected_revision then raise exception 'Profile changed; reload before saving' using errcode='40001'; end if;
  if new_name is null or char_length(trim(new_name)) not between 2 and 100
    or new_phone is null or char_length(new_phone)>30
    or new_street is null or char_length(trim(new_street)) not between 1 and 300
    or new_city is null or char_length(trim(new_city)) not between 1 and 100
    or new_province is null or char_length(trim(new_province)) not between 1 and 100
    or new_description is null or char_length(new_description)>300 then raise exception 'Invalid business profile' using errcode='22023'; end if;
  full_address := concat_ws(', ',trim(new_street),trim(new_city),trim(new_province));
  if char_length(full_address)>500 then raise exception 'Address too long' using errcode='22023'; end if;
  update public.businesses set name=trim(new_name), phone=trim(new_phone), address=full_address,
    street_address=trim(new_street), city=trim(new_city), province=trim(new_province), description=trim(new_description),
    profile_revision=profile_revision+1 where id=target_id returning * into current_row;
  return current_row;
end;
$$;
revoke all on function public.save_business_profile(uuid,integer,text,text,text,text,text,text) from public;
grant execute on function public.save_business_profile(uuid,integer,text,text,text,text,text,text) to authenticated;

create function public.create_business_profile(
  store_name text, owner_name text, store_phone text, store_street text,
  store_city text, store_province text, store_description text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  created_id := public.create_business(store_name,owner_name,store_phone,store_street);
  perform public.save_business_profile(created_id,0,store_name,store_phone,store_street,store_city,store_province,store_description);
  return created_id;
end;
$$;
revoke all on function public.create_business_profile(text,text,text,text,text,text,text) from public;
grant execute on function public.create_business_profile(text,text,text,text,text,text,text) to authenticated;

create function public.save_business_hours(target_id uuid, expected_revision integer, schedule jsonb)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare current_row public.businesses;
begin
  if not public.has_business_access(target_id,array['owner']) then raise exception 'Business access denied' using errcode='42501'; end if;
  select * into current_row from public.businesses where id=target_id for update;
  if expected_revision is null or current_row.hours_revision <> expected_revision then raise exception 'Hours changed; reload before saving' using errcode='40001'; end if;
  if not public.valid_business_hours(schedule) then raise exception 'Invalid or overlapping hours' using errcode='22023'; end if;
  update public.businesses set operating_hours=schedule, hours_revision=hours_revision+1 where id=target_id returning * into current_row;
  return current_row;
end;
$$;
revoke all on function public.save_business_hours(uuid,integer,jsonb) from public;
grant execute on function public.save_business_hours(uuid,integer,jsonb) to authenticated;

create function public.reserve_business_logo(target_id uuid, asset_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare object_path text;
begin
  if not public.has_business_access(target_id,array['owner']) then raise exception 'Business access denied' using errcode='42501'; end if;
  object_path := target_id::text || '/' || asset_id::text || '.png';
  insert into public.business_logo_assets(id,business_id,path) values(asset_id,target_id,object_path);
  return object_path;
end;
$$;
revoke all on function public.reserve_business_logo(uuid,uuid) from public;
grant execute on function public.reserve_business_logo(uuid,uuid) to authenticated;

create function public.set_business_logo(target_id uuid, expected_revision integer, asset_id uuid)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare current_row public.businesses; candidate public.business_logo_assets;
begin
  if not public.has_business_access(target_id,array['owner']) then raise exception 'Business access denied' using errcode='42501'; end if;
  select * into current_row from public.businesses where id=target_id for update;
  if expected_revision is null or current_row.profile_revision <> expected_revision then raise exception 'Profile changed; reload before saving' using errcode='40001'; end if;
  if asset_id is not null then
    select * into candidate from public.business_logo_assets where id=asset_id and business_id=target_id for update;
    if not found or candidate.state <> 'staging' then raise exception 'Logo is not available for activation' using errcode='22023'; end if;
    if not exists(select 1 from storage.objects where bucket_id='business-logos' and name=candidate.path
      and metadata->>'mimetype'='image/png' and (metadata->>'size')::bigint between 1 and 2097152) then
      raise exception 'Logo upload is incomplete' using errcode='22023';
    end if;
  end if;
  update public.business_logo_assets set state='retired',updated_at=now() where business_id=target_id and path=current_row.logo_path and state='active';
  if asset_id is not null then
    update public.business_logo_assets set state='active',updated_at=now() where id=asset_id;
  end if;
  update public.businesses set logo_path=case when asset_id is null then null else candidate.path end,
    profile_revision=profile_revision+1 where id=target_id returning * into current_row;
  return current_row;
end;
$$;
revoke all on function public.set_business_logo(uuid,integer,uuid) from public;
grant execute on function public.set_business_logo(uuid,integer,uuid) to authenticated;

-- Cleanup locks the same business row as activation, then tombstones the asset.
-- Once claimed, even a late activation request cannot attach it to a business.
create function public.claim_business_logo_cleanup(asset_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare candidate public.business_logo_assets; current_path text;
begin
  select * into candidate from public.business_logo_assets where id=asset_id;
  if not found then return null; end if;
  select logo_path into current_path from public.businesses where id=candidate.business_id for update;
  select * into candidate from public.business_logo_assets where id=asset_id for update;
  if current_path = candidate.path or candidate.state in ('active','deleted') then return null; end if;
  if candidate.state='staging' and candidate.created_at > now()-interval '15 minutes' then return null; end if;
  update public.business_logo_assets set state='deleting',updated_at=now() where id=asset_id;
  return candidate.path;
end;
$$;
revoke all on function public.claim_business_logo_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.claim_business_logo_cleanup(uuid) to service_role;

-- Private bucket: only service-side staged uploads/deletes. Members read only
-- their current logo; no arbitrary object or staging-file access is granted.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-logos','business-logos',false,2097152,array['image/png']);
create policy business_current_logo_read on storage.objects for select to authenticated
  using (bucket_id='business-logos' and exists(
    select 1 from public.businesses b where b.logo_path=storage.objects.name
      and public.has_business_access(b.id)
  ));

notify pgrst, 'reload schema';
commit;
