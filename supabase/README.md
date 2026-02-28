# NutriVault Supabase Backend

## Quick Setup (15 min)

### 1. Database Table
Go to [Supabase Dashboard](https://supabase.com/dashboard) > SQL Editor.
Paste and run the contents of `migrations/001_activation_codes.sql`.

### 2. Deploy Edge Functions

Install Supabase CLI (if not already installed):
```bash
npm install -g supabase
supabase login
```

Navigate to the NutriVault project root and link:
```bash
cd /path/to/NutriVault
supabase link --project-ref gbdrsqskqvsfnwyeidda
```

Deploy all three functions (use `--use-api` if Docker is not running):
```bash
supabase functions deploy create-code --use-api
supabase functions deploy verify-code --use-api
supabase functions deploy extend-subscription --use-api
```

**Important:** Run these commands from the NutriVault project root directory (where the `supabase/` folder is).

### 3. Test

Create a code:
```bash
curl -X POST https://gbdrsqskqvsfnwyeidda.supabase.co/functions/v1/create-code \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

Verify a code:
```bash
curl -X POST https://gbdrsqskqvsfnwyeidda.supabase.co/functions/v1/verify-code \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "1234567890123456"}'
```

## Architecture

```
Client (app)
  |
  |-- CREATE code --> Edge Function (service_role key) --> INSERT into DB
  |-- VERIFY code --> REST API (anon key, RLS allows SELECT) --> READ from DB
  |-- EXTEND sub --> Edge Function (service_role key) --> UPDATE in DB
```

- **Edge Functions** run server-side with `service_role` key (bypasses RLS)
- **REST API reads** use the `anon` key (RLS allows SELECT for verification)
- **No client-side writes** to the database (secure by design)

## Security

- Activation codes are SHA-256 hashed before storage
- Plain codes are only shown once to the user
- RLS blocks all client INSERT/UPDATE/DELETE
- Edge Functions handle all writes with service_role key
- Anon key only allows reading (for code verification)
