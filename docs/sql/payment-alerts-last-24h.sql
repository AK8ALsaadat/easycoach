-- Run manually in the Supabase SQL editor. Read-only. No secrets or card data are stored.
-- Any row here deserves attention: webhook 401s (wrong/missing Authorization header) and
-- failed or mismatched verifications (review = amount/order/currency/date mismatch).
select date_trunc('hour', created_at) as hour,
       source,
       status,
       sum(occurrences)            as occurrences,
       count(distinct invoice_id)  as invoices,
       max(last_seen_at)           as last_seen_at,
       (array_agg(request_id order by last_seen_at desc))[1] as latest_request_id
from private.payment_events
where last_seen_at > now() - interval '24 hours'
  and status in ('unauthorized', 'verification_failed', 'review')
group by 1, 2, 3
order by 1 desc, 2, 3;

-- Full state history of one invoice (replace the id):
-- select created_at, source, status, amount_halalas, provider_amount_halalas, request_id
-- from private.payment_events where invoice_id = '00000000-0000-0000-0000-000000000000' order by id;
