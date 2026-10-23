begin;

-- Existing businesses retain access. New businesses start as saved drafts.
alter table public.businesses add column onboarding_completed_at timestamptz default now();
alter table public.businesses alter column onboarding_completed_at drop default;

create function public.complete_business_onboarding(target_id uuid)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare result public.businesses;
begin
  if not public.has_business_access(target_id,array['owner']) then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  select * into result from public.businesses where id=target_id for update;
  if result.onboarding_completed_at is null then
    if char_length(trim(result.name)) < 2 or trim(result.street_address) = ''
      or trim(result.city) = '' or trim(result.province) = '' or trim(result.phone) = '' then
      raise exception 'Complete business identity first' using errcode='22023';
    end if;
    update public.businesses set onboarding_completed_at=now() where id=target_id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.complete_business_onboarding(uuid) from public;
grant execute on function public.complete_business_onboarding(uuid) to authenticated;
commit;
