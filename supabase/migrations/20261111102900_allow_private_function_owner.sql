-- Hosted Supabase: "alter function private.* owner to coach_api" needs coach_api
-- to hold CREATE on schema private. Granted for the following migrations and
-- revoked again in 20261113130000_revoke_private_function_owner.sql.
grant create on schema private to coach_api;
