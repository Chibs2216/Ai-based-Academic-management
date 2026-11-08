-- Event-trigger helper that ships with the project; nobody should call it over the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
