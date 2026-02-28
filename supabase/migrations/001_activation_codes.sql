-- NutriVault Activation Codes Table
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard > SQL Editor)

CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_code_hash ON activation_codes(code_hash);

-- Enable Row Level Security
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can verify codes (read by hash) via anon key
CREATE POLICY "Allow code verification"
  ON activation_codes FOR SELECT
  USING (true);

-- All INSERT/UPDATE/DELETE operations go through Edge Functions
-- which use the service_role key (bypasses RLS)
