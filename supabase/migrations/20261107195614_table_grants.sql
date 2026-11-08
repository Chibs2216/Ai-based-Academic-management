-- Table privileges. This project does not grant table access to API roles by default,
-- so grant exactly what each role needs; RLS then decides which rows.

-- Start clean: anon gets nothing in public; nobody on the API gets TRUNCATE/TRIGGER/REFERENCES.
revoke all on all tables in schema public from anon, authenticated;

-- Signed-in users: normal DML, filtered by RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Server-only tables.
revoke all on public.email_outbox, public.mfa_recovery_codes from authenticated;

-- Written only by triggers / edge functions; users may read (RLS-filtered).
revoke insert, update, delete on public.audit_logs, public.material_summaries, public.course_results from authenticated;
revoke insert on public.notifications from authenticated;

-- Edge functions (service role) bypass RLS but still need privileges.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Future tables follow the same default.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

