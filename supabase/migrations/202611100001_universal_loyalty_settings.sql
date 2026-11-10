create or replace function public.save_business_loyalty_settings(target_id uuid,new_active boolean,new_nominal numeric)
returns public.businesses language plpgsql security definer set search_path='' as $$
declare result public.businesses;
begin
  perform 1 from public.businesses where id=target_id for update;
  if not found or not (public.has_business_access(target_id,array['owner']) or exists(select 1 from public.businesses where id=target_id and owner_id=auth.uid())) then
    raise exception 'Loyalty settings access denied' using errcode='42501';
  end if;
  if new_active is null or new_nominal is null or new_nominal<1 or new_nominal>1000000000 or new_nominal<>trunc(new_nominal) then
    raise exception 'Invalid loyalty configuration' using errcode='22023';
  end if;
  update public.businesses set loyalty_active=new_active,loyalty_point_nominal=new_nominal where id=target_id returning * into result;
  return result;
end $$;
revoke all on function public.save_business_loyalty_settings(uuid,boolean,numeric) from public;
grant execute on function public.save_business_loyalty_settings(uuid,boolean,numeric) to authenticated;
