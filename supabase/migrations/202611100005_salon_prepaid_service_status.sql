begin;

do $$ declare c record; body text; needle text; begin
 for c in select conname from pg_constraint where conrelid='public.salon_visits'::regclass
 and contype='c' and pg_get_constraintdef(oid) like '%sale_id IS NULL%'
 and pg_get_constraintdef(oid) like '%finished%' loop
  execute format('alter table public.salon_visits drop constraint %I',c.conname);
 end loop;
 alter table public.salon_visits add constraint salon_paid_service_status
 check(sale_id is null or status in ('scheduled','waiting','in_service','finished','cancelled'));

 body:=pg_get_functiondef('public.salon_visit_operation(uuid,uuid,integer,uuid,text,jsonb)'::regprocedure);
 needle:='if details<>''{}''::jsonb or v.sale_id is not null then raise exception ''Invalid visit transition'' using errcode=''22023''; end if;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unexpected salon transition function; inspect before applying'; end if;
 execute replace(body,needle,$patch$
 if details<>'{}'::jsonb then raise exception 'Invalid visit transition' using errcode='22023'; end if;
 if v.sale_id is not null and not exists(select 1 from public.pos_transactions where business_id=target_id and id=v.sale_id and status='completed') then
  raise exception 'Pembayaran sudah dibatalkan; pelayanan tidak dapat dilanjutkan.' using errcode='P0001'; end if;
 $patch$);

 body:=pg_get_functiondef('public.cancel_salon_sale(uuid,uuid,text,boolean,boolean)'::regprocedure);
 needle:='insert into public.salon_audit';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unexpected salon refund function; inspect before applying'; end if;
 execute replace(body,needle,$patch$
 if v.status in ('scheduled','waiting','in_service') then
  update public.salon_visits set status='cancelled',cancellation_reason=btrim(explanation),revision=revision+1
  where id=v.id and business_id=target_id;
 end if;
 insert into public.salon_audit$patch$);
end $$;

create function public.guard_paid_salon_service() returns trigger language plpgsql set search_path='' as $$
begin
 if new.sale_id is not null and new.status='cancelled' and exists(
  select 1 from public.pos_transactions where business_id=new.business_id and id=new.sale_id and status='completed') then
  raise exception 'Batalkan transaksi dan konfirmasi refund manual sebelum membatalkan pelayanan lunas.' using errcode='P0001';
 end if;
 return new;
end $$;
create trigger guard_paid_salon_service before insert or update of status,sale_id on public.salon_visits
for each row execute function public.guard_paid_salon_service();
revoke all on function public.guard_paid_salon_service() from public,anon,authenticated;

-- Only the authenticated server action can call this service-role bridge.
create function public.commit_salon_cart_checkout(target_id uuid,checkout_actor uuid,sale_details jsonb,visit_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.pos_transactions; v public.salon_visits; p public.salon_practitioners;
begin
 perform 1 from public.businesses where id=target_id and category='barbershop' and onboarding_completed_at is not null for update;
 if not found or not exists(select 1 from public.business_members where business_id=target_id and user_id=checkout_actor
  and active and not must_change_password and role in ('owner','admin','cashier')) then
  raise exception 'Salon checkout access denied' using errcode='42501'; end if;
 s:=jsonb_populate_record(null::public.pos_transactions,sale_details);
 if s.business_id is distinct from target_id or s.actor_id is distinct from checkout_actor or s.status is distinct from 'completed' then
  raise exception 'Invalid salon checkout' using errcode='22023'; end if;
 if s.customer_id is not null and not exists(select 1 from public.customers where business_id=target_id and id=s.customer_id and active) then
  raise exception 'Member tidak aktif atau tidak ditemukan.' using errcode='P0001'; end if;
 if visit_details is not null and visit_details<>'null'::jsonb then
  v:=jsonb_populate_record(null::public.salon_visits,visit_details);
  if v.business_id is distinct from target_id or v.actor_id is distinct from checkout_actor or v.sale_id is distinct from s.id
   or v.status is distinct from (case when v.kind='walk_in' then 'waiting' else 'scheduled' end)
   or v.started_at is not null or v.finished_at is not null then
   raise exception 'Invalid prepaid service state' using errcode='22023'; end if;
  select * into p from public.salon_practitioners where business_id=target_id and id=v.practitioner_id and active;
  if not found then raise exception 'Penata tidak aktif atau tidak ditemukan.' using errcode='P0001'; end if;
  if not public.salon_hours_cover((select operating_hours from public.businesses where id=target_id),v.starts_at,v.busy_until)
   or not public.salon_hours_cover(p.schedule,v.starts_at,v.busy_until) then
   raise exception 'Slot dan jeda persiapan berada di luar jam operasional salon atau penata.' using errcode='P0001'; end if;
  if public.salon_slot_conflict(target_id,v.practitioner_id,v.starts_at,v.busy_until,v.id) then
   raise exception 'Slot penata sudah terisi; pilih waktu lain.' using errcode='PT409'; end if;
  if exists(select 1 from jsonb_array_elements(v.lines) line where not exists(
   select 1 from public.salon_services x join public.salon_practitioner_services ps
   on ps.business_id=x.business_id and ps.service_id=x.id and ps.practitioner_id=v.practitioner_id
   where x.business_id=target_id and x.id=(line->>'id')::uuid and x.active)) then
   raise exception 'Layanan tidak tersedia untuk penata ini.' using errcode='P0001'; end if;
 end if;
 insert into public.pos_transactions(id,business_id,actor_id,actor_name,customer_id,customer,lines,subtotal,
 discount_kind,discount_value,discount,total,payment,received,change,status,tax_rate,tax_amount,service_rate,
 service_amount,tax_base,receipt_number,points_earned,deposit_amount,deposit_payment,balance_received,product_discount,order_discount)
 values(s.id,target_id,checkout_actor,s.actor_name,s.customer_id,s.customer,s.lines,s.subtotal,
 s.discount_kind,s.discount_value,s.discount,s.total,s.payment,s.received,s.change,s.status,s.tax_rate,s.tax_amount,s.service_rate,
 s.service_amount,s.tax_base,s.receipt_number,s.points_earned,s.deposit_amount,s.deposit_payment,s.balance_received,s.product_discount,s.order_discount)
 returning * into s;
 if v.id is not null then
  insert into public.salon_visits(id,business_id,actor_id,actor_name,practitioner_id,practitioner_name,customer_id,customer,
  phone,notes,kind,starts_at,ends_at,buffer_minutes,busy_until,lines,subtotal,status,arrived_at,started_at,finished_at,
  sale_id,deposit_amount,deposit_payment,deposit_refunded,revision)
  values(v.id,target_id,checkout_actor,v.actor_name,v.practitioner_id,p.name,v.customer_id,v.customer,
  v.phone,v.notes,v.kind,v.starts_at,v.ends_at,v.buffer_minutes,v.busy_until,v.lines,v.subtotal,v.status,
  case when v.kind='walk_in' then now() else null end,null,null,s.id,0,null,0,1) returning * into v;
  insert into public.salon_audit(business_id,actor_id,resource,resource_id,before_row,after_row)
  values(target_id,checkout_actor,'visit',v.id,null,to_jsonb(v));
 end if;
 return jsonb_build_object('sale',to_jsonb(s),'visit',case when v.id is null then null else to_jsonb(v) end);
end $$;
revoke all on function public.commit_salon_cart_checkout(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_salon_cart_checkout(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
