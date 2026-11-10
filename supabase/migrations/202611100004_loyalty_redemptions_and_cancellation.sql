-- Migration: Add loyalty_redemptions column and relax salon visit cancellation/no_show constraints
alter table public.businesses add column if not exists loyalty_redemptions jsonb not null default '[]'::jsonb;

-- Update save_business_loyalty_settings to accept redemptions
create or replace function public.save_business_loyalty_settings(
  target_id uuid,
  new_active boolean,
  new_nominal numeric,
  new_redemptions jsonb default '[]'::jsonb
) returns public.businesses
language plpgsql security definer set search_path=public as $$
declare
  b public.businesses;
begin
  if not public.has_business_role(target_id, 'owner') then
    raise exception 'Hanya pemilik yang dapat mengatur program poin.' using errcode = '42501';
  end if;

  if new_nominal is null or new_nominal < 1 or new_nominal > 1000000000 or new_nominal <> trunc(new_nominal) then
    raise exception 'Isi nominal rupiah bulat antara Rp1 dan Rp1.000.000.000.' using errcode = '22023';
  end if;

  update public.businesses
  set
    loyalty_active = coalesce(new_active, false),
    loyalty_point_nominal = new_nominal,
    loyalty_redemptions = coalesce(new_redemptions, '[]'::jsonb)
  where id = target_id
  returning * into b;

  if not found then
    raise exception 'Usaha tidak ditemukan.' using errcode = 'P0002';
  end if;

  return b;
end $$;

revoke all on function public.save_business_loyalty_settings(uuid,boolean,numeric,jsonb) from public;
grant execute on function public.save_business_loyalty_settings(uuid,boolean,numeric,jsonb) to authenticated;

