# IU Dynamics admin panel

The admin panel is served at `/admin.html` and uses Supabase Auth email magic links. The server checks every request against the active allowlist in `public.iu_admins`; a client-side email check is never used as authorization.

## Requirements
- Vercel variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Supabase Auth email sign-in enabled.
- Add `https://iu-dynamics.vercel.app/admin.html` to Supabase Auth's allowed redirect URLs.
- Only the server may use `SUPABASE_SERVICE_ROLE_KEY`. Do not expose it in browser code or a `NEXT_PUBLIC_` variable.
- The active admin allowlist currently contains the intended administrator address. Disable/remove entries from `public.iu_admins` to revoke access.

## Included
- Provider enable/disable switches (settings are enforced by customer start endpoints when implemented).
- Plan link-count and availability controls. Existing sessions retain their stored `required_links` snapshot.
- Bulk key import, inventory counts, and deletion of unused keys only. Key values are never returned by the inventory endpoint.
- Audit records for settings, plan, and inventory changes.
- A one-time atomic claim endpoint backed by `claim_iu_license_key`.

## Not a public-launch certification
The Cuty.io completion-verification method must be confirmed against its account-specific developer documentation before that provider is allowed to unlock keys. A click, redirect, or browser-supplied completion flag is not sufficient. Test provider callbacks and claims with dummy keys in a Preview deployment before public use.
