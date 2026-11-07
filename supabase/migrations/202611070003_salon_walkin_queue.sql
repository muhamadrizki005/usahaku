begin;
do $patch$
declare body text; needle text;
begin
 body:=pg_get_functiondef('public.salon_visit_operation(uuid,uuid,integer,uuid,text,jsonb)'::regprocedure);
 needle:='starts>now()+interval ''15 minutes''';
 if strpos(body,needle)=0 then raise exception 'Unexpected salon walk-in time guard'; end if;
 body:=replace(body,needle,'starts>now()+interval ''24 hours''');
 body:=replace(body,'Walk-in memakai waktu kedatangan saat ini; gunakan janji temu untuk jadwal mendatang.','Walk-in hanya dapat memakai estimasi mulai dalam 24 jam; gunakan janji temu untuk jadwal berikutnya.');
 needle:=' or (details->>''kind''=''walk_in'' and exists(select 1 from public.salon_visits x where x.business_id=target_id and x.practitioner_id=p.id and x.id<>item_id and x.status=''in_service''))';
 if strpos(body,needle)=0 then raise exception 'Unexpected salon walk-in occupancy guard'; end if;
 body:=replace(body,needle,'');
 execute body;
end $patch$;
notify pgrst,'reload schema';
commit;
