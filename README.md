# IU Dynamics access application

IU Dynamics is a Vercel-hosted software-key access site using Supabase for plan, session, provider-attempt and license inventory data.

## Current capabilities in this branch
- Four existing plans: Super Basic (1 link), Basic (2), Epic (5), Ultimate (10).
- Server-side Work.ink link override and token verification. Verification uses Work.ink's documented `/_api/v2/token/isValid/{token}?deleteToken=1` endpoint; test this in a preview with a real token before public launch.
- Provider selection is per session. Cuty.io is deliberately fail-closed and not offered to customers until its account-supported developer API provides a reliable server-side completion-verification contract. Creating a short link or seeing a redirect is not proof of completion.
- Atomic one-time key claim RPC: only an unlocked, unexpired session can claim one available key, and the key and session are marked claimed in one database transaction.
- Admin panel at `/admin.html`, protected server-side by Supabase Auth plus the active allowlist in `public.iu_admins`.
- Admin can adjust plan requirements, enable/disable providers, bulk add keys and remove unused keys. Key values are not returned by the inventory API. Changes are audited.

## Required Vercel environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose in frontend code)
- `WORKINK_KEY_LINK_URL`
- `WORKINK_API_KEY`
- `APP_URL=https://iu-dynamics.vercel.app` (recommended)

## Supabase Auth setup
- Enable email magic-link sign-in.
- Add `https://iu-dynamics.vercel.app/admin.html` to the allowed redirect URLs.
- The server verifies the Auth token and checks the user's normalized email against `public.iu_admins` on every admin API call. Client-side allowlists are not authorization.

## Database
Apply the SQL files under `supabase/migrations` to the project, or confirm the equivalent migrations are present. The RPC is executable only by `service_role`; browser roles cannot call it. Existing sessions keep the `required_links` value captured at session creation.

## Database setup\n\nFor a new Supabase project, apply `supabase/migrations/20261020_base_schema.sql` first, followed by the dated migrations in filename order. The baseline creates the four plan records, keeps Cuty disabled, enables RLS, and withholds direct table access from browser roles. Add the administrator allowlist row separately after confirming the intended admin email. The rate-limit migration creates a service-role-only fixed-window limiter; the app hashes the client identity with a server-only secret before storing it.\n\n## Security headers\n\n`vercel.json` applies HTTPS-only transport, clickjacking protection, MIME-sniffing protection, a restrictive Content Security Policy, no-referrer behavior, and a minimal permissions policy. The current CSP allows inline code because the static HTML pages contain inline scripts and styles; moving those to separate versioned files or using nonces would permit a stricter policy.\n\n## Before public launch
1. Verify Work.ink override + token callback end-to-end in a Vercel Preview deployment using a dummy key.
2. Keep Cuty.io disabled until a trusted server-side completion verification method is confirmed and implemented.
3. Add real software keys through the admin panel; the current inventory was empty during implementation.
4. Test duplicate callbacks, expired sessions, concurrent claim requests, no-stock behavior, admin allowlist rejection and provider-disable behavior.
5. Add request rate limits/abuse controls before promotion. Never unlock on a client-supplied flag, click count or redirect alone.
