# NutriVault Supabase Backend

## Quick Setup (15 min)

### 1. Database Table & Policies
Go to [Supabase Dashboard](https://supabase.com/dashboard) > SQL Editor.
Run the migrations in order:
```bash
# Initial table
migrations/001_activation_codes.sql

# Remove broad anon SELECT policy (all reads go through Edge Functions now)
migrations/002_restrict_anon_select.sql
```

### 2. Set Edge Function Secrets

Generate a shared secret:
```bash
openssl rand -hex 32
```

Set it in Supabase:
```bash
supabase secrets set EDGE_FUNCTION_SECRET=your-generated-secret
```

Also add this same secret to your Vercel environment variables as `EDGE_FUNCTION_SECRET`.

### 3. Deploy Edge Functions

Install Supabase CLI (if not already installed):
```bash
npm install -g supabase
supabase login
```

Navigate to the NutriVault project root and link:
```bash
cd /path/to/NutriVault
supabase link --project-ref YOUR_PROJECT_REF
```

Deploy all functions (use `--use-api` if Docker is not running):
```bash
supabase functions deploy create-code --use-api
supabase functions deploy verify-code --use-api
supabase functions deploy extend-subscription --use-api
supabase functions deploy check-entitlement --use-api   # gates /api/gemini
```

**Important:** Run these commands from the NutriVault project root directory (where the `supabase/` folder is).

### 4. Vercel Environment Variables

Set these in your Vercel project settings:

| Variable | Where | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Frontend | Vercel deployment URL |
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anon key |
| `GEMINI_API_KEY` | Server | Google Gemini API key |
| `SUPABASE_URL` | Server | Supabase project URL |
| `SUPABASE_ANON_KEY` | Server | Supabase anon key |
| `EDGE_FUNCTION_SECRET` | Server | Shared secret (same as step 2) |
| `ALLOWED_ORIGINS` | Server | Extra CORS origins (optional, comma-separated) |
| `REQUIRE_GEMINI_AUTH` | Server | `true` to gate `/api/gemini` behind an active code |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Server | Durable rate limiting (optional) |
| `ALLOW_MANUAL_EXTEND` | Server | `true` to re-enable the manual extend proxy (default off) |
| `REQUIRE_PURCHASE_RECEIPT` / `REVENUECAT_SECRET_KEY` | Server | Gate code creation on a real purchase (optional) |

### 5. Enabling the Gemini subscription gate

`/api/gemini` can be used as a free open LLM proxy unless it's gated. To close that:

1. Deploy the `check-entitlement` edge function (step 3).
2. Set `REQUIRE_GEMINI_AUTH=true` in Vercel.

The client already sends the user's activation code as `x-activation-code`; the
proxy verifies it (active + not expired) server-side, caching positive results
for ~60s. Leave the flag off until the edge function is deployed, or all AI
calls will 402.

### 6. Test

Create a code (via Vercel API proxy). NOTE: with `REQUIRE_PURCHASE_RECEIPT`
unset this is unauthenticated and mints a 30-day code — set that flag (and
`REVENUECAT_SECRET_KEY`) in production so only real purchases can mint codes:
```bash
curl -X POST https://nutri-vault-two.vercel.app/api/create-code \
  -H "Content-Type: application/json"
```

Verify a code (via Edge Function directly):
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/verify-code \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "1234567890123456"}'
```

## Architecture

```
Client (app)
  |
  |-- CREATE code --> /api/create-code (Vercel) --> Edge Function (secret) --> DB
  |-- VERIFY code --> Edge Function (anon key, service_role internally) --> DB
  |-- EXTEND sub --> RevenueCat webhook (signature) --> /api/... --> Edge Function --> DB
  |-- AI call ----> /api/gemini (Vercel) --> check-entitlement (secret) --> DB
```

- **Write operations** (create, extend) go through Vercel API proxy routes that add `EDGE_FUNCTION_SECRET`
- **Read operations** (verify, check-entitlement) call Edge Functions with the secret / anon key
- **Edge Functions** run server-side with `service_role` key (bypasses RLS)
- **No direct client-side database access** (anon SELECT policy removed in migration 002)
- **AI proxy** is gated on an active subscription when `REQUIRE_GEMINI_AUTH=true`
- **Manual extend** proxy is disabled by default; renewals arrive via the signed webhook

## Security

- Activation codes are SHA-256 hashed before storage
- Plain codes are only shown once to the user
- RLS blocks ALL client access (no anon SELECT since migration 002)
- Write Edge Functions require `EDGE_FUNCTION_SECRET` header
- Vercel API proxy routes hold the secret server-side
- Error messages are generic (no internal details leaked to clients)
- CORS restricts origins to known deployments
