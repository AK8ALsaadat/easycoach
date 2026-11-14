-- SELECT-only first-rollout checks: compatible with CLI --read-only.
with checks as (
 select
 (select count(*)=4 from public.ec_plans) as catalog_complete,
 (select jsonb_agg(price_halalas order by price_halalas)='[0,29900,49900,69900]'::jsonb from public.ec_plans) as exact_prices,
 (select count(*)=1 and not bool_or(discount_enabled or trial_enabled or provider_verified) from public.ec_config) as campaigns_disabled,
 not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'ec_%' and c.relkind='r' and not c.relrowsecurity) as rls_enabled,
 not (has_table_privilege('authenticated','public.ec_accounts','select') or has_table_privilege('authenticated','public.ec_consents','insert') or has_table_privilege('anon','public.ec_invoices','select')) as direct_access_denied,
 not (has_function_privilege('authenticated','public.ec_record_payment(text,uuid,text,integer,text,boolean)','execute') or has_function_privilege('authenticated','public.ec_confirm_setup(uuid,text,text)','execute') or has_function_privilege('anon','public.ec_workspace_page(uuid,uuid,uuid,uuid,text)','execute')) as privileged_rpcs_private,
 (has_function_privilege('service_role','public.ec_reconcile()','execute') and has_function_privilege('service_role','public.ec_queue_package_expiry()','execute')) as maintenance_granted
)
select (select bool_and(value::boolean) from jsonb_each_text(to_jsonb(checks))) as ready,to_jsonb(checks) as checks,
 (select jsonb_agg(jsonb_build_object('code',code,'halalas',price_halalas,'clients',client_limit,'coaches',coach_limit,'templates',template_limit) order by price_halalas) from public.ec_plans) as plans
from checks;