begin;
do $$
declare old_constraint text;
begin
  select conname into strict old_constraint from pg_catalog.pg_constraint
    where conrelid='public.business_payments'::regclass and contype='c'
      and regexp_replace(pg_catalog.pg_get_constraintdef(oid),'[[:space:]()]','','g')='CHECKcashORqrisORtransfer';
  execute format('alter table public.business_payments drop constraint %I',old_constraint);
end $$;
create or replace function public.save_business_payments(target_id uuid,expected_revision integer,details jsonb,asset_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_settings public.business_payments; bank jsonb; next_qris boolean; next_transfer boolean; next_cash boolean; candidate public.business_payment_assets;
begin
  perform 1 from public.businesses where id=target_id and category='store' for update;
  if not found or not public.has_business_access(target_id,array['owner']) then raise exception 'Payment access denied' using errcode='42501'; end if;
  select * into current_settings from public.business_payments where business_id=target_id;
  if expected_revision is null or expected_revision<>coalesce(current_settings.revision,0) then raise exception 'Payments changed; reload' using errcode='PT409'; end if;
  if details is null or jsonb_typeof(details)<>'object' or details-array['cash','qris','transfer','banks']<>'{}'::jsonb
    or jsonb_typeof(details->'cash') is distinct from 'boolean' or jsonb_typeof(details->'qris') is distinct from 'boolean' or jsonb_typeof(details->'transfer') is distinct from 'boolean'
    or jsonb_typeof(details->'banks') is distinct from 'array' or jsonb_array_length(details->'banks')>10 then raise exception 'Invalid payment settings' using errcode='22023'; end if;
  next_cash:=(details->>'cash')::boolean;next_qris:=(details->>'qris')::boolean;next_transfer:=(details->>'transfer')::boolean;
  if (next_qris and asset_id is null) or (not next_qris and asset_id is not null) or (next_transfer and jsonb_array_length(details->'banks')=0) then raise exception 'Complete payment settings' using errcode='22023'; end if;
  for bank in select value from jsonb_array_elements(details->'banks') loop
    if jsonb_typeof(bank)<>'object' or bank-array['bank','holder','account']<>'{}'::jsonb or jsonb_typeof(bank->'bank') is distinct from 'string' or jsonb_typeof(bank->'holder') is distinct from 'string' or jsonb_typeof(bank->'account') is distinct from 'string'
      or char_length(trim(bank->>'bank')) not between 1 and 100 or char_length(trim(bank->>'holder')) not between 1 and 160 or char_length(trim(bank->>'account')) not between 1 and 100 then raise exception 'Invalid bank details' using errcode='22023'; end if;
  end loop;
  if asset_id is not null then
    select * into candidate from public.business_payment_assets where id=asset_id and business_id=target_id for update;
    if not found or not(candidate.state='staging' or (candidate.state='active' and current_settings.qris_asset=asset_id))
      or not exists(select 1 from storage.objects where bucket_id='business-payment-qr' and name=candidate.path) then raise exception 'QR image unavailable' using errcode='22023'; end if;
  end if;
  insert into public.business_payments(business_id,cash,qris,transfer,banks,qris_asset) values(target_id,next_cash,next_qris,next_transfer,details->'banks',asset_id)
    on conflict(business_id) do update set cash=excluded.cash,qris=excluded.qris,transfer=excluded.transfer,banks=excluded.banks,qris_asset=excluded.qris_asset,revision=business_payments.revision+1,updated_at=now() returning * into current_settings;
  update public.business_payment_assets set state='retired' where business_id=target_id and state='active' and id is distinct from asset_id;
  update public.business_payment_assets set state='active' where id=asset_id;
  return to_jsonb(current_settings);
end $$;

commit;
