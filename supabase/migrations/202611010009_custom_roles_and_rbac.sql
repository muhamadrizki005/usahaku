-- Migration: 202611010009_custom_roles_and_rbac.sql
-- Role-Based Access Control (RBAC) with Custom Roles & Permissions for Usahaku

-- 1. Loosen role constraint on business_members to allow custom roles
alter table public.business_members drop constraint if exists business_members_role_check;
alter table public.business_members add constraint business_members_role_check
  check (char_length(trim(role)) between 1 and 60);

-- 2. Create business_roles table
create table if not exists public.business_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  description text not null default '',
  is_default boolean not null default false,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique index per business and case-insensitive role name
create unique index if not exists business_roles_business_name_idx
  on public.business_roles (business_id, lower(trim(name)));

create index if not exists business_roles_business_id_idx
  on public.business_roles (business_id);

-- 3. Row Level Security for business_roles
alter table public.business_roles enable row level security;

drop policy if exists business_roles_select on public.business_roles;
create policy business_roles_select on public.business_roles for select to authenticated
using (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_roles.business_id
      and m.user_id = auth.uid()
      and m.active = true
  )
);

drop policy if exists business_roles_insert on public.business_roles;
create policy business_roles_insert on public.business_roles for insert to authenticated
with check (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_roles.business_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.active = true
  )
);

drop policy if exists business_roles_update on public.business_roles;
create policy business_roles_update on public.business_roles for update to authenticated
using (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_roles.business_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.active = true
  )
)
with check (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_roles.business_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.active = true
  )
);

drop policy if exists business_roles_delete on public.business_roles;
create policy business_roles_delete on public.business_roles for delete to authenticated
using (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_roles.business_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.active = true
  )
  and is_default = false
);

grant select, insert, update, delete on public.business_roles to authenticated;
grant all on public.business_roles to service_role;

-- 4. Seed default roles function
create or replace function public.seed_default_business_roles(target_business_id uuid)
returns void as $$
begin
  -- Admin Toko default role
  insert into public.business_roles (business_id, name, description, is_default, permissions)
  values (
    target_business_id,
    'Admin Toko',
    'Akses operasional toko termasuk produk, stok, kasir, transaksi, pelanggan, dan laporan.',
    true,
    '["overview:view", "products:view", "products:create", "products:edit", "products:delete", "inventory:view", "inventory:create", "inventory:edit", "pos:view", "pos:create", "pos:cancel", "pos:discount", "transactions:view", "transactions:cancel", "transactions:refund", "customers:view", "customers:create", "customers:edit", "customers:delete", "reports:view", "reports:export"]'::jsonb
  )
  on conflict (business_id, lower(trim(name))) do nothing;

  -- Petugas Kasir default role
  insert into public.business_roles (business_id, name, description, is_default, permissions)
  values (
    target_business_id,
    'Petugas Kasir',
    'Akses transaksi penjualan di kasir (POS) dan melihat transaksi sendiri.',
    true,
    '["pos:view", "pos:create", "transactions:view"]'::jsonb
  )
  on conflict (business_id, lower(trim(name))) do nothing;
end;
$$ language plpgsql security definer;

-- 5. Auto-seed trigger when a new business is registered
create or replace function public.on_business_created_seed_roles()
returns trigger as $$
begin
  perform public.seed_default_business_roles(new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists tr_seed_default_roles on public.businesses;
create trigger tr_seed_default_roles
after insert on public.businesses
for each row execute function public.on_business_created_seed_roles();

-- 6. Seed existing businesses
do $$
declare
  b record;
begin
  for b in select id from public.businesses loop
    perform public.seed_default_business_roles(b.id);
  end loop;
end;
$$;
