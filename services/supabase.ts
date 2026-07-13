/**
 * Supabase Client
 *
 * Write operations (create, extend) go through Vercel API proxy routes
 * which add a server-side secret before calling Edge Functions.
 * Read operations (verify) go through Edge Functions directly.
 *
 * SETUP: See /supabase/migrations/001_activation_codes.sql
 * DEPLOY: See /supabase/README.md
 */

// Configuration - require env vars, no hardcoded fallbacks
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';

import { API_BASE_URL } from './config';
import { createLogger } from './logger';

const log = createLogger('Supabase');

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
};

// Call a Supabase Edge Function directly (for read-only operations)
const callEdgeFunction = async (functionName: string, body: Record<string, unknown>) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function error ${response.status}: ${text}`);
  }

  return response.json();
};

// Call a Vercel API proxy route (for write operations that need server-side secret)
const callApiRoute = async (route: string, body: Record<string, unknown>) => {
  const response = await fetch(`${API_BASE_URL}/api/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
};

/**
 * Create a new activation code via Vercel API proxy
 * The proxy adds a server-side secret before calling the Edge Function
 */
export const createActivationCode = async (appUserId?: string): Promise<{ code: string; name: string } | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    // appUserId (RevenueCat customer id) lets the server verify the purchase
    // receipt when REQUIRE_PURCHASE_RECEIPT is enabled
    const result = await callApiRoute('create-code', appUserId ? { appUserId } : {});
    if (result.error) throw new Error(result.error);
    return { code: result.code, name: result.name };
  } catch (error) {
    log.error('Failed to create activation code', error);
    return null;
  }
};

/**
 * Verify an activation code via Edge Function (read-only, no secret needed)
 */
export const verifyActivationCode = async (code: string): Promise<{
  success: boolean;
  expiry?: number;
  name?: string;
} | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const result = await callEdgeFunction('verify-code', { code });
    return {
      success: result.success === true,
      expiry: result.expiry,
      name: result.name,
    };
  } catch (error) {
    log.error('Failed to verify code', error);
    return null; // null = Supabase unavailable, fallback to mock
  }
};

/**
 * Extend subscription via Vercel API proxy
 * The proxy adds a server-side secret before calling the Edge Function
 */
export const extendSubscription = async (code: string, months: number): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;

  try {
    const result = await callApiRoute('extend-subscription', { code, months });
    return result.success === true;
  } catch (error) {
    log.error('Failed to extend subscription', error);
    return false;
  }
};
