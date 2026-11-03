begin;

alter table public.business_roles add column role_key text;
update public.business_roles set role_key = case
  when is_default and lower(trim(name)) in ('admin','admin toko') then 'admin'
  when is_default and lower(trim(name)) in ('cashier','kasir','petugas kasir') then 'cashier'
  else id::text end;
alter table public.business_roles alter column role_key set not null;
alter table public.business_roles add constraint business_role_identity check (
  (is_default and role_key in ('admin','cashier')) or (not is_default and role_key=id::text));
create unique index business_role_key_unique on public.business_roles(business_id,role_key);

create function public.role_permission_limit(role_key text) returns text[]
language sql immutable set search_path='' as $$
  select case when role_key='cashier' then array['pos:view','pos:create','transactions:view'] else
    array['overview:view','products:view','products:create','products:edit','products:delete',
      'inventory:view','inventory:create','inventory:edit','pos:view','pos:create','pos:cancel','pos:discount',
      'transactions:view','transactions:cancel','transactions:refund','customers:view','customers:create',
      'customers:edit','customers:delete','reports:view','reports:export'] end
$$;
revoke all on function public.role_permission_limit(text) from public;

create function public.check_business_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' and new.role_key is null then
    new.role_key:=case when new.is_default and lower(trim(new.name)) in ('admin','admin toko') then 'admin'
      when new.is_default and lower(trim(new.name)) in ('cashier','kasir','petugas kasir') then 'cashier' else new.id::text end;
  end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.business_id<>old.business_id or new.role_key<>old.role_key or new.is_default<>old.is_default) then
    raise exception 'Role identity is immutable' using errcode='42501';
  end if;
  if not new.is_default and lower(trim(new.name)) in ('owner','pemilik','admin','admin toko','cashier','kasir','petugas kasir') then
    raise exception 'Reserved role name' using errcode='22023';
  end if;
  if jsonb_typeof(new.permissions) is distinct from 'array' then raise exception 'Invalid permissions' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(new.permissions) p where jsonb_typeof(p)<>'string' or not (p#>>'{}'=any(public.role_permission_limit(new.role_key)))) then
    raise exception 'Permission is not assignable to this role' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.check_business_role() from public,anon,authenticated;
create trigger check_business_role before insert or update on public.business_roles for each row execute function public.check_business_role();

update public.business_members m set role=r.role_key from public.business_roles r
where r.business_id=m.business_id and m.role not in ('owner','admin','cashier')
  and (m.role=r.id::text or lower(trim(m.role))=lower(trim(r.name))) and m.role is distinct from r.role_key;

create function public.check_business_member_role() returns trigger
language plpgsql security definer set search_path='' as $$
declare key text;
begin
  if tg_op='UPDATE' and old.role='owner' and new.role is distinct from old.role then raise exception 'Owner role is immutable' using errcode='42501'; end if;
  key:=case lower(trim(new.role)) when 'owner' then 'owner' when 'pemilik' then 'owner'
    when 'admin' then 'admin' when 'admin toko' then 'admin' when 'cashier' then 'cashier'
    when 'kasir' then 'cashier' when 'petugas kasir' then 'cashier' else null end;
  if key='owner' then
    if not exists(select 1 from public.businesses where id=new.business_id and owner_id=new.user_id) then raise exception 'Owner identity mismatch' using errcode='42501'; end if;
  elsif key is null then
    select r.role_key into key from public.business_roles r where r.business_id=new.business_id
      and (r.role_key=new.role or r.id::text=new.role or lower(trim(r.name))=lower(trim(new.role)));
    if key is null then raise exception 'Unknown business role' using errcode='22023'; end if;
  end if;
  new.role:=key;
  return new;
end $$;
revoke all on function public.check_business_member_role() from public,anon,authenticated;
create trigger check_business_member_role before insert or update of role,business_id,user_id on public.business_members for each row execute function public.check_business_member_role();

create function public.protect_assigned_business_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.business_members where business_id=old.business_id and role=old.role_key) then
    raise exception 'Role is still assigned' using errcode='PT409';
  end if;
  return old;
end $$;
revoke all on function public.protect_assigned_business_role() from public,anon,authenticated;
create trigger protect_assigned_business_role before delete on public.business_roles for each row execute function public.protect_assigned_business_role();

create function public.has_business_membership(target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.business_members where business_id=target_id and user_id=auth.uid() and active and not must_change_password)
$$;

create function public.business_permissions(target_id uuid) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare m public.business_members; r public.business_roles; category text;
begin
  select * into m from public.business_members where business_id=target_id and user_id=auth.uid() and active and not must_change_password;
  if not found then return '{}'::text[]; end if;
  if m.role='owner' then return array['*']; end if;
  select b.category into category from public.businesses b where b.id=target_id;
  if category<>'store' and m.role not in ('admin','cashier') then return '{}'::text[]; end if;
  select * into r from public.business_roles where business_id=target_id and role_key=m.role;
  if not found or jsonb_typeof(r.permissions)<>'array' then return '{}'::text[]; end if;
  return array(select distinct p from jsonb_array_elements_text(r.permissions) p where p=any(public.role_permission_limit(r.role_key)));
end $$;

create function public.has_business_permission(target_id uuid, permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.business_permissions(target_id) && array['*',permission],false)
$$;
revoke all on function public.has_business_membership(uuid), public.business_permissions(uuid),public.has_business_permission(uuid,text) from public,anon;
grant execute on function public.has_business_membership(uuid),public.business_permissions(uuid),public.has_business_permission(uuid,text) to authenticated,service_role;

create function public.can_read_store_sale(target_id uuid, actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.has_business_permission(target_id,'overview:view') or public.has_business_permission(target_id,'reports:view')
    or public.has_business_permission(target_id,'customers:view')
    or (public.has_business_permission(target_id,'transactions:view') and (
      actor=auth.uid() or public.has_business_access(target_id,array['owner','admin'])
      or (public.has_business_permission(target_id,'transactions:cancel') and public.has_business_permission(target_id,'transactions:refund'))))
$$;
revoke all on function public.can_read_store_sale(uuid,uuid) from public,anon;
grant execute on function public.can_read_store_sale(uuid,uuid) to authenticated,service_role;

create function public.can_manage_product_image(target_id uuid,item_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.has_business_permission(target_id,'products:view') and (
    public.has_business_permission(target_id,'products:edit') or (
      public.has_business_permission(target_id,'products:create') and exists (
        select 1 from public.catalog_products p where p.business_id=target_id and p.id=item_id and p.image_path is null and p.revision=0
        and exists(select 1 from public.catalog_audit a where a.business_id=target_id and a.product_id=item_id and a.actor_id=auth.uid() and a.before_data is null))))
$$;
revoke all on function public.can_manage_product_image(uuid,uuid) from public,anon;
grant execute on function public.can_manage_product_image(uuid,uuid) to authenticated,service_role;

-- Keep the installed financial bodies; refuse unexpected signatures instead of
-- silently replacing a different checkout implementation.
do $migration$
declare job record; body text; changed text; signature regprocedure;
begin
  for job in select * from (values
    ('catalog_request(uuid,uuid,jsonb)', 'public.has_business_access(target_id,array[''owner'',''admin''])', 'public.has_business_membership(target_id)', ''),
    ('save_catalog_product(uuid,uuid,integer,uuid,jsonb)', '', '',
      'if not public.has_business_permission(target_id,''products:view'') or not public.has_business_permission(target_id,case when expected_version is null then ''products:create'' else ''products:edit'' end) or (expected_version is not null and details->''active''=''false''::jsonb and not public.has_business_permission(target_id,''products:delete'')) then raise exception ''Product permission denied'' using errcode=''42501''; end if;'),
    ('move_catalog_stock(uuid,uuid,integer,uuid,text,text,text)', '', '',
      'if not public.has_business_permission(target_id,''inventory:view'') or not public.has_business_permission(target_id,case when movement_kind=''adjustment'' then ''inventory:edit'' else ''inventory:create'' end) then raise exception ''Inventory permission denied'' using errcode=''42501''; end if;'),
    ('bulk_catalog_products(uuid,uuid,jsonb,text,boolean)', '', '',
      'if not public.has_business_permission(target_id,''products:view'') or not public.has_business_permission(target_id,case when new_category is not null then ''products:edit'' else ''products:delete'' end) then raise exception ''Product permission denied'' using errcode=''42501''; end if;'),
    ('reserve_product_image(uuid,uuid,uuid)', 'public.has_business_access(target_id,array[''owner'',''admin''])', 'public.can_manage_product_image(target_id,item_id)', ''),
    ('set_product_image(uuid,uuid,integer,uuid)', 'public.has_business_access(target_id,array[''owner'',''admin''])', 'public.can_manage_product_image(target_id,item_id)', ''),
    ('save_customer(uuid,uuid,integer,uuid,jsonb)', 'public.has_business_access(target_id,array[''owner'',''admin''])', 'public.has_business_permission(target_id,''customers:view'')',
      'if not public.has_business_permission(target_id,case when expected_version is null then ''customers:create'' else ''customers:edit'' end) or (expected_version is not null and details->''active''=''false''::jsonb and not public.has_business_permission(target_id,''customers:delete'')) then raise exception ''Customer permission denied'' using errcode=''42501''; end if;'),
    ('search_pos_customers(uuid,text)', 'public.has_business_access(target_id)', 'public.has_business_permission(target_id,''pos:view'')', ''),
    ('checkout_pos(uuid,uuid,jsonb)', 'public.has_business_access(target_id)', 'public.has_business_permission(target_id,''pos:create'')',
      'if not public.has_business_permission(target_id,''pos:view'') or (coalesce(details->>''discountKind'',''none'')<>''none'' and not public.has_business_permission(target_id,''pos:discount'')) then raise exception ''POS permission denied'' using errcode=''42501''; end if;'),
    ('cancel_pos(uuid,uuid,text,boolean,boolean)', 'public.has_business_access(target_id,array[''owner'',''admin''])', '(public.has_business_permission(target_id,''transactions:cancel'') and public.has_business_permission(target_id,''transactions:refund'') and public.has_business_permission(target_id,''transactions:view''))', ''),
    ('read_sales_report(uuid,timestamptz,timestamptz,text)', 'public.has_business_access(target_id,array[''owner'',''admin''])', 'public.has_business_permission(target_id,''reports:view'')', '')
  ) as jobs(name,old_check,new_check,guard) loop
    signature:=to_regprocedure('public.'||job.name);
    if signature is null then raise exception 'Required function missing: %',job.name; end if;
    body:=pg_get_functiondef(signature);
    changed:=body;
    if job.old_check<>'' then
      if strpos(changed,job.old_check)=0 then raise exception 'Unexpected authorization body: %',job.name; end if;
      changed:=replace(changed,job.old_check,job.new_check);
    end if;
    if job.guard<>'' then
      changed:=regexp_replace(changed,E'\nbegin[\r\n]+', E'\nbegin\n  '||job.guard||E'\n','i');
      if strpos(changed,job.guard)=0 then raise exception 'Missing authorization insertion point: %',job.name; end if;
    end if;
    if job.name='checkout_pos(uuid,uuid,jsonb)' then
      if strpos(changed,'actor.role not in (''owner'',''admin'')')=0 then raise exception 'Unexpected discount authorization'; end if;
      changed:=replace(changed,'actor.role not in (''owner'',''admin'')','not public.has_business_permission(target_id,''pos:discount'')');
    end if;
    execute changed;
  end loop;
end $migration$;

drop policy business_read on public.businesses;
create policy business_read on public.businesses for select to authenticated using(public.has_business_membership(id));
drop policy catalog_read on public.catalog_products;
create policy catalog_read on public.catalog_products for select to authenticated using (
  public.has_business_permission(business_id,'products:view') or public.has_business_permission(business_id,'inventory:view')
  or public.has_business_permission(business_id,'overview:view') or (active and public.has_business_permission(business_id,'pos:view')));
drop policy stock_history_read on public.stock_movements;
create policy stock_history_read on public.stock_movements for select to authenticated using(public.has_business_permission(business_id,'inventory:view'));
drop policy catalog_audit_read on public.catalog_audit;
create policy catalog_audit_read on public.catalog_audit for select to authenticated using(public.has_business_permission(business_id,'products:view'));
drop policy pos_read on public.pos_transactions;
create policy pos_read on public.pos_transactions for select to authenticated using(public.can_read_store_sale(business_id,actor_id));
drop policy customer_read on public.customers;
create policy customer_read on public.customers for select to authenticated using(public.has_business_permission(business_id,'customers:view'));
drop policy customer_audit_read on public.customer_audit;
create policy customer_audit_read on public.customer_audit for select to authenticated using(public.has_business_permission(business_id,'customers:view'));
drop policy customer_point_history_read on public.customer_point_history;
create policy customer_point_history_read on public.customer_point_history for select to authenticated using(public.has_business_access(business_id,array['owner','admin']) and public.has_business_permission(business_id,'customers:view'));

drop policy payment_settings_read on public.business_payments;
create policy payment_settings_read on public.business_payments for select to authenticated using(public.has_business_access(business_id,array['owner']) or public.has_business_permission(business_id,'pos:view'));
drop policy payment_asset_read on public.business_payment_assets;
create policy payment_asset_read on public.business_payment_assets for select to authenticated using (
  (public.has_business_access(business_id,array['owner']) or public.has_business_permission(business_id,'pos:view')) and state='active'
  and exists(select 1 from public.business_payments p where p.business_id=business_payment_assets.business_id and p.qris_asset=business_payment_assets.id));
drop policy payment_qr_read on storage.objects;
create policy payment_qr_read on storage.objects for select to authenticated using (
  bucket_id='business-payment-qr' and exists(select 1 from public.business_payment_assets a join public.business_payments p on p.business_id=a.business_id and p.qris_asset=a.id
    where a.path=storage.objects.name and a.state='active' and (public.has_business_access(a.business_id,array['owner']) or public.has_business_permission(a.business_id,'pos:view'))));

drop policy business_roles_select on public.business_roles;
create policy business_roles_select on public.business_roles for select to authenticated using(public.has_business_membership(business_id));
drop policy business_roles_insert on public.business_roles;
create policy business_roles_insert on public.business_roles for insert to authenticated with check(public.has_business_access(business_id,array['owner']));
drop policy business_roles_update on public.business_roles;
create policy business_roles_update on public.business_roles for update to authenticated using(public.has_business_access(business_id,array['owner'])) with check(public.has_business_access(business_id,array['owner']));
drop policy business_roles_delete on public.business_roles;
create policy business_roles_delete on public.business_roles for delete to authenticated using(public.has_business_access(business_id,array['owner']) and not is_default);

drop policy product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories for select to authenticated using(public.has_business_permission(business_id,'products:view') or public.has_business_permission(business_id,'pos:view'));
drop policy product_units_select on public.product_units;
create policy product_units_select on public.product_units for select to authenticated using(public.has_business_permission(business_id,'products:view') or public.has_business_permission(business_id,'pos:view'));
drop policy product_categories_insert on public.product_categories;
create policy product_categories_insert on public.product_categories for insert to authenticated with check(public.has_business_permission(business_id,'products:create') or public.has_business_permission(business_id,'products:edit'));
drop policy product_units_insert on public.product_units;
create policy product_units_insert on public.product_units for insert to authenticated with check(public.has_business_permission(business_id,'products:create') or public.has_business_permission(business_id,'products:edit'));

drop policy product_current_image_read on storage.objects;
create policy product_current_image_read on storage.objects for select to authenticated using (
  bucket_id='product-images' and exists(select 1 from public.catalog_products p where p.image_path=storage.objects.name));

revoke all on function public.seed_default_business_roles(uuid) from public,anon,authenticated;
grant execute on function public.seed_default_business_roles(uuid) to service_role;
notify pgrst,'reload schema';
commit;
