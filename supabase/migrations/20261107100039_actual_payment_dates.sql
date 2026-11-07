-- Subscription starts can be future-dated; recorded receipts must have happened.
alter table public.payments add constraint payment_date_not_future
check(paid_date <= (now() at time zone 'Asia/Riyadh')::date);
