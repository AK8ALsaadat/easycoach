# Support tickets

Apply the additive `20261111120000_support_tickets.sql` migration with the normal Supabase migration workflow. It creates the private `support-attachments` bucket when Supabase Storage is available. No public bucket or permanent public image URL is used.

Set `SUPPORT_OWNER_USER_ID` in the server environment to the UUID of the one platform owner in `auth.users`. The account name is deliberately not used as an authorization check. If this variable is unset, users can submit tickets and see their own tickets, while the platform-wide inbox and status controls remain unavailable. Keep `SUPABASE_SERVICE_ROLE_KEY` configured only on the server for private attachment storage and the owner inbox.

For local preview, set the same owner UUID in the untracked `.env.local` file to enable the owner inbox locally. The identity must be a real, provisioned auth UUID; do not use a display name or a request parameter.
