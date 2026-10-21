-- Run on a Supabase project. Auth users are owned by Supabase Auth.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  name text not null check (char_length(name) between 2 and 100),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  category text not null default 'store' check (category = 'store'),
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  user_id uuid not null unique references auth.users(id),
  name text not null check (char_length(name) between 2 and 100),
  username text check (username ~ '^[a-z0-9_]{3,24}$'),
  role text not null check (role in ('owner', 'admin', 'cashier')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, username),
  check ((role = 'owner' and username is null) or (role <> 'owner' and username is not null))
);

create unique index one_owner_per_business on public.business_members(business_id) where role = 'owner';
create index business_members_business_id on public.business_members(business_id);
create table public.staff_audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  member_id uuid not null references public.business_members(id),
  actor_user_id uuid references auth.users(id),
  operation text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
create index staff_audit_business on public.staff_audit_logs(business_id, created_at);
alter table public.staff_audit_logs enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

-- Security definer avoids recursive RLS. The fixed search_path prevents object shadowing.
create function public.has_business_access(target_business uuid, allowed_roles text[] default array['owner','admin','cashier'])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target_business and m.user_id = auth.uid()
      and m.active and not m.must_change_password and m.role = any(allowed_roles)
  );
$$;
revoke all on function public.has_business_access(uuid, text[]) from public;
grant execute on function public.has_business_access(uuid, text[]) to authenticated;

create function public.log_staff_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_audit_logs(business_id, member_id, actor_user_id, operation, details)
  values(new.business_id, new.id, coalesce(new.changed_by, auth.uid()),
    case when TG_OP = 'INSERT' then 'created'
      when old.active is distinct from new.active then case when new.active then 'activated' else 'deactivated' end
      when old.must_change_password is distinct from new.must_change_password then case when new.must_change_password then 'password_reset_requested' else 'password_changed' end
      else 'updated' end,
    jsonb_build_object('name', new.name, 'role', new.role, 'active', new.active, 'must_change_password', new.must_change_password));
  return new;
end;
$$;
revoke all on function public.log_staff_change() from public;
create trigger staff_change_audit after insert or update on public.business_members
  for each row execute function public.log_staff_change();
create policy staff_audit_owner_read on public.staff_audit_logs for select to authenticated
  using (public.has_business_access(business_id, array['owner']));
revoke all on public.staff_audit_logs from anon, authenticated;
grant select on public.staff_audit_logs to authenticated;
grant all on public.staff_audit_logs to service_role;

create policy business_read on public.businesses for select to authenticated
  using (public.has_business_access(id));
create policy business_owner_update on public.businesses for update to authenticated
  using (public.has_business_access(id, array['owner']))
  with check (public.has_business_access(id, array['owner']));
create policy members_read on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.has_business_access(business_id, array['owner']));

-- No direct creation/role changes by clients. Staf writes use a server-only service client.
revoke all on public.businesses, public.business_members from anon, authenticated;
grant select on public.businesses, public.business_members to authenticated;
grant update(name, phone, address) on public.businesses to authenticated;
grant all on public.businesses, public.business_members to service_role;

create function public.create_business(business_name text, owner_name text, business_phone text default '', business_address text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  business_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(business_name)) not between 2 and 100 or char_length(trim(owner_name)) not between 2 and 100 then
    raise exception 'Invalid name';
  end if;
  -- Staff identities are created by the server and cannot register a new business.
  if exists (select 1 from auth.users where id = current_user_id and raw_app_meta_data ->> 'account_type' = 'staff') then
    raise exception 'Staff cannot create a business';
  end if;
  if exists (select 1 from public.business_members where user_id = current_user_id) then
    raise exception 'Account already belongs to a business';
  end if;
  insert into public.businesses(owner_id, name, code, phone, address)
    values(current_user_id, trim(business_name), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), left(business_phone, 30), left(business_address, 500))
    returning id into business_id;
  insert into public.business_members(business_id, user_id, name, role, changed_by)
    values(business_id, current_user_id, trim(owner_name), 'owner', current_user_id);
  return business_id;
end;
$$;
revoke all on function public.create_business(text, text, text, text) from public;
grant execute on function public.create_business(text, text, text, text) to authenticated;
