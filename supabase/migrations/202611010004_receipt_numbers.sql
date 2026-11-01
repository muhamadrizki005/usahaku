begin;

alter table public.pos_transactions add column receipt_number text;
create unique index pos_receipt_number_unique on public.pos_transactions(receipt_number) where receipt_number is not null;

create table public.receipt_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  receipt_day date not null,
  last_number bigint not null check(last_number > 0),
  primary key(business_id,receipt_day)
);
alter table public.receipt_counters enable row level security;
revoke all on public.receipt_counters from public,anon,authenticated;
grant select on public.receipt_counters to service_role;

create function public.assign_receipt_number() returns trigger
language plpgsql security definer set search_path='' as $$
declare store_code text; receipt_date date; receipt_sequence bigint;
begin
  if tg_op='UPDATE' then
    if new.receipt_number is distinct from old.receipt_number then
      raise exception 'Receipt number is immutable' using errcode='22023';
    end if;
    return new;
  end if;
  select code into strict store_code from public.businesses where id=new.business_id;
  receipt_date:=(new.created_at at time zone 'Asia/Jakarta')::date;
  insert into public.receipt_counters as counter(business_id,receipt_day,last_number)
    values(new.business_id,receipt_date,1)
    on conflict(business_id,receipt_day) do update set last_number=counter.last_number+1
    returning last_number into receipt_sequence;
  new.receipt_number:='TRX-'||store_code||'-'||to_char(receipt_date,'YYYYMMDD')||'-'||lpad(receipt_sequence::text,greatest(4,length(receipt_sequence::text)),'0');
  return new;
end $$;
revoke all on function public.assign_receipt_number() from public,anon,authenticated;
create trigger pos_assign_receipt_number before insert or update of receipt_number on public.pos_transactions
  for each row execute function public.assign_receipt_number();

commit;
