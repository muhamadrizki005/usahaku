begin;

alter table public.businesses
  add column district text not null default '' check (char_length(district) <= 100),
  add column village text not null default '' check (char_length(village) <= 100);

create function public.save_business_profile_with_location(
  target_id uuid, expected_revision integer, new_name text, new_phone text,
  new_street text, new_city text, new_province text, new_description text,
  new_district text, new_village text
) returns public.businesses language plpgsql security definer set search_path='' as $$
declare result public.businesses; full_address text;
begin
  if new_district is null or char_length(trim(new_district)) > 100
    or new_village is null or char_length(trim(new_village)) > 100
    or (trim(new_village) <> '' and trim(new_district) = '') then
    raise exception 'Invalid district or village' using errcode='22023';
  end if;
  result := public.save_business_profile(target_id,expected_revision,new_name,new_phone,new_street,new_city,new_province,new_description);
  full_address := concat_ws(', ',trim(new_street),nullif(trim(new_village),''),nullif(trim(new_district),''),trim(new_city),trim(new_province));
  if char_length(full_address) > 500 then raise exception 'Address too long' using errcode='22023'; end if;
  update public.businesses set district=trim(new_district),village=trim(new_village),address=full_address
    where id=target_id returning * into result;
  return result;
end $$;
revoke all on function public.save_business_profile_with_location(uuid,integer,text,text,text,text,text,text,text,text) from public;
grant execute on function public.save_business_profile_with_location(uuid,integer,text,text,text,text,text,text,text,text) to authenticated;

create function public.create_business_profile_with_location(
  business_category text, store_name text, owner_name text, store_phone text,
  store_street text, store_city text, store_province text, store_description text,
  store_district text, store_village text
) returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid; current_revision integer;
begin
  if business_category is null or business_category not in ('store','restaurant') then
    raise exception 'Unsupported business category' using errcode='22023';
  end if;
  if business_category='restaurant' then
    created_id := public.create_business_profile_for_category(business_category,store_name,owner_name,store_phone,store_street,store_city,store_province,store_description);
  else
    created_id := public.create_business_profile(store_name,owner_name,store_phone,store_street,store_city,store_province,store_description);
  end if;
  select profile_revision into current_revision from public.businesses where id=created_id;
  perform public.save_business_profile_with_location(created_id,current_revision,store_name,store_phone,store_street,store_city,store_province,store_description,store_district,store_village);
  return created_id;
end $$;
revoke all on function public.create_business_profile_with_location(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_business_profile_with_location(text,text,text,text,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
