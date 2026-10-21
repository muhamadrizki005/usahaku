-- READ ONLY. Run in the existing project's SQL Editor if catalog inspection is required.
-- Do not run the baseline CREATE TABLE migration against an existing foundation.
select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public'
and table_name in ('businesses', 'business_members', 'staff_audit_logs') order by table_name, ordinal_position;
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('businesses', 'business_members', 'staff_audit_logs');
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('businesses', 'business_members', 'staff_audit_logs');
select grantee, table_name, privilege_type from information_schema.table_privileges
where table_schema = 'public' and table_name in ('businesses', 'business_members', 'staff_audit_logs');
select p.proname, p.prosecdef, p.proconfig, p.proacl, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('create_business', 'has_business_access', 'log_staff_change');
select event_object_table, trigger_name, action_statement from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'business_members';
-- Check whether CLI history exists before inspecting it; manual SQL may not be recorded there.
select to_regclass('supabase_migrations.schema_migrations') as migration_history_table;
