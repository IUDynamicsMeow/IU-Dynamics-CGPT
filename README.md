# IU Dynamics access starter

This is a starter application for the IU Dynamics plan and Work.ink verification flow. It is **not production-ready for license delivery** yet.

## Includes
- Static plan selector reading active plans from Supabase
- Server-side session creation; only a SHA-256 hash of the session token is stored
- Work.ink Link Override setup and token verification return handler
- Server-side Supabase service key usage only

## Required Vercel environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefix this with `NEXT_PUBLIC_`)
- `WORKINK_KEY_LINK_URL` (the Work.ink link configured for the key system)
- `WORKINK_API_KEY` (server-only)
- `APP_URL` (recommended: `https://iu-dynamics.vercel.app`)

Set variables for Production and Preview as appropriate, then redeploy.

## Critical remaining work before public launch
1. Confirm Work.ink's current Link Override and token verification response format against the account's live documentation.
2. Add rate limiting / abuse controls to session creation and link starts.
3. Implement a secure, atomic key-claim RPC/function and a claim UI. No key is delivered by this starter.
4. Confirm Cuty.io offers a trustworthy server-side completion verification method before counting any Cuty link.
5. Test with dummy data in a preview deployment, verify RLS and database grants, then test the complete lifecycle.
6. Do not unlock based only on a redirect or click statistic.

The GitHub integration rejected repository writes with HTTP 403 (`Resource not accessible by integration`) during setup. The files were packaged locally instead; no GitHub commit or Vercel deployment was made.
