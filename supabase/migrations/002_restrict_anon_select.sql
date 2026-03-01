-- Remove the broad anon SELECT policy on activation_codes
-- All reads now go through Edge Functions using service_role key
-- This prevents any client with the anon key from querying the table directly

DROP POLICY IF EXISTS "Allow code verification" ON activation_codes;
