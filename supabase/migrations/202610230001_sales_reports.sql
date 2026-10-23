begin;

-- One database statement/snapshot for both sales and refund events.
-- This is read-only; no existing sales, stock, customer or demo data is updated.
create function public.read_sales_report(target_id uuid,from_ts timestamptz,to_ts timestamptz,payment_method text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sales jsonb; refunds jsonb; sale_count bigint; refund_count bigint;
begin
  if not public.has_business_access(target_id,array['owner','admin'])
    or not exists(select 1 from public.businesses where id=target_id and category='store') then
    raise exception 'Report access denied' using errcode='42501';
  end if;
  if from_ts is null or to_ts is null or not isfinite(from_ts) or not isfinite(to_ts)
    or to_ts<=from_ts or to_ts-from_ts>interval '366 days'
    or (from_ts at time zone 'Asia/Jakarta')::time<>'00:00:00'::time
    or (to_ts at time zone 'Asia/Jakarta')::time<>'00:00:00'::time
    or payment_method is null or payment_method not in ('all','cash','qris','transfer') then
    raise exception 'Invalid report range or payment' using errcode='22023';
  end if;
  select count(*) into sale_count from public.pos_transactions
    where business_id=target_id and created_at>=from_ts and created_at<to_ts
      and (payment_method='all' or payment=payment_method);
  select count(*) into refund_count from public.pos_transactions
    where business_id=target_id and status='cancelled' and cancelled_at>=from_ts and cancelled_at<to_ts
      and (payment_method='all' or payment=payment_method);
  if sale_count>20000 or refund_count>20000 then
    raise exception 'Report too large; narrow date range' using errcode='PT413';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id),'[]'::jsonb) into sales
    from public.pos_transactions s where s.business_id=target_id and s.created_at>=from_ts and s.created_at<to_ts
      and (payment_method='all' or s.payment=payment_method);
  select coalesce(jsonb_agg(to_jsonb(s) order by s.cancelled_at desc,s.id),'[]'::jsonb) into refunds
    from public.pos_transactions s where s.business_id=target_id and s.status='cancelled' and s.cancelled_at>=from_ts and s.cancelled_at<to_ts
      and (payment_method='all' or s.payment=payment_method);
  return jsonb_build_object('sales',sales,'refunds',refunds,'generatedAt',statement_timestamp());
end $$;
revoke all on function public.read_sales_report(uuid,timestamptz,timestamptz,text) from public;
grant execute on function public.read_sales_report(uuid,timestamptz,timestamptz,text) to authenticated;
create index pos_refund_history on public.pos_transactions(business_id,cancelled_at desc,id) where status='cancelled';

commit;
