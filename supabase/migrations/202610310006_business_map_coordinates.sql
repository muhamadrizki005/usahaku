begin;

alter table public.businesses
  add column latitude double precision,
  add column longitude double precision,
  add constraint business_map_coordinates_pair check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null and latitude between -11.5 and 6.5 and longitude between 94.5 and 141.5)
  );

create function public.save_business_profile_with_map(
  target_id uuid, expected_revision integer, new_name text, new_phone text,
  new_street text, new_city text, new_province text, new_description text,
  new_district text, new_village text, new_latitude double precision, new_longitude double precision
) returns public.businesses language plpgsql security definer set search_path='' as $$
declare result public.businesses;
begin
  result := public.save_business_profile_with_location(target_id,expected_revision,new_name,new_phone,new_street,new_city,new_province,new_description,new_district,new_village);
  update public.businesses set latitude=new_latitude,longitude=new_longitude where id=target_id returning * into result;
  return result;
end $$;
revoke all on function public.save_business_profile_with_map(uuid,integer,text,text,text,text,text,text,text,text,double precision,double precision) from public;
grant execute on function public.save_business_profile_with_map(uuid,integer,text,text,text,text,text,text,text,text,double precision,double precision) to authenticated;

create function public.create_business_profile_with_map(
  business_category text, store_name text, owner_name text, store_phone text,
  store_street text, store_city text, store_province text, store_description text,
  store_district text, store_village text, store_latitude double precision, store_longitude double precision
) returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid;
begin
  created_id := public.create_business_profile_with_location(business_category,store_name,owner_name,store_phone,store_street,store_city,store_province,store_description,store_district,store_village);
  update public.businesses set latitude=store_latitude,longitude=store_longitude where id=created_id;
  return created_id;
end $$;
revoke all on function public.create_business_profile_with_map(text,text,text,text,text,text,text,text,text,text,double precision,double precision) from public;
grant execute on function public.create_business_profile_with_map(text,text,text,text,text,text,text,text,text,text,double precision,double precision) to authenticated;

notify pgrst, 'reload schema';
commit;
