import { generateId } from "../utils/calculations";
import {
  isSupabaseConfigured,
  createActivationCode,
  verifyActivationCode,
  extendSubscription
} from "./supabase";

// Local storage keys
const MOCK_DB_KEY = 'nutrivault_server_db_hashes';
const SESSION_KEY = 'nutrivault_auth_session';

// Session interface
interface Session {
  accountNumber: string;
  token: string;
  subscriptionEnds: number;
  name?: string;
  expiry: number;
  createdAt?: number; // When session was first created (for max lifetime check)
}

// Mock database account interface
interface MockAccount {
  hashedKey: string;
  subscriptionExpiry: number;
  createdAt: number;
  name?: string;
}

// Food-themed display name generators (unique per account)
const ADJECTIVES = [
  'Fresh', 'Golden', 'Spicy', 'Sweet', 'Crispy', 'Roasted', 'Juicy', 'Ripe',
  'Savory', 'Zesty', 'Smoky', 'Tangy', 'Creamy', 'Crunchy', 'Toasted',
  'Glazed', 'Seared', 'Grilled', 'Minty', 'Nutty'
];
const FOODS = [
  'Avocado', 'Mango', 'Coconut', 'Papaya', 'Walnut', 'Pistachio', 'Acai',
  'Quinoa', 'Truffle', 'Saffron', 'Ginger', 'Wasabi', 'Matcha', 'Cacao',
  'Tahini', 'Kimchi', 'Kombucha', 'Tempeh', 'Arugula', 'Dragonfruit'
];

// Hash function - requires Web Crypto API (available in all modern browsers and Capacitor)
const hashKey = async (key: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Create a new account
 * Uses Supabase if configured, otherwise falls back to local mock
 */
export const createAccount = async (): Promise<{ key: string; name: string }> => {
  // Try Supabase first
  if (isSupabaseConfigured()) {
    const result = await createActivationCode();
    if (result) {
      return { key: result.code, name: result.name };
    }
  }

  // Fallback to local mock

  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  const key = Array.from(array).map(n => n.toString().slice(-4).padStart(4, '0')).join('');
  const hashed = await hashKey(key);

  const dbStr = localStorage.getItem(MOCK_DB_KEY);
  const db: MockAccount[] = dbStr ? JSON.parse(dbStr) : [];

  // Generate unique food-themed name
  const existingNames = new Set(db.map(acc => acc.name));
  let name = '';
  for (let i = 0; i < 20; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const food = FOODS[Math.floor(Math.random() * FOODS.length)];
    const candidate = `${adj} ${food}`;
    if (!existingNames.has(candidate)) {
      name = candidate;
      break;
    }
  }
  if (!name) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const food = FOODS[Math.floor(Math.random() * FOODS.length)];
    name = `${adj} ${food} ${Math.floor(Math.random() * 100)}`;
  }

  db.push({
    hashedKey: hashed,
    subscriptionExpiry: Date.now() + (1000 * 60 * 60 * 24 * 30), // 30 days
    createdAt: Date.now(),
    name
  });

  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
  return { key, name };
};

/**
 * Verify an activation key
 * Uses Supabase if configured, otherwise falls back to local mock
 */
export const verifyKey = async (inputKey: string): Promise<{
  success: boolean;
  expiry?: number;
  token?: string;
  name?: string
}> => {
  // Try Supabase first
  if (isSupabaseConfigured()) {
    const result = await verifyActivationCode(inputKey);
    if (result && result.success) {
      return {
        success: true,
        expiry: result.expiry,
        token: `jwt_${generateId()}_${Date.now()}`,
        name: result.name
      };
    }
    // If Supabase didn't find it, fall through to local mock
    // (code may have been created locally when Edge Functions were unavailable)
  }

  // Fallback to local mock
  const hashedInput = await hashKey(inputKey.replace(/\s/g, ''));
  const dbStr = localStorage.getItem(MOCK_DB_KEY);
  const db: MockAccount[] = dbStr ? JSON.parse(dbStr) : [];

  const account = db.find(acc => acc.hashedKey === hashedInput);
  if (!account || Date.now() > account.subscriptionExpiry) {
    return { success: false };
  }

  return {
    success: true,
    expiry: account.subscriptionExpiry,
    token: `jwt_${generateId()}_${Date.now()}`,
    name: account.name || "Unknown User"
  };
};

/**
 * Add subscription time to an account
 */
export const addTime = async (inputKey: string, months: number): Promise<boolean> => {
  // Try Supabase first
  if (isSupabaseConfigured()) {
    const result = await extendSubscription(inputKey, months);
    if (result) {
      return true;
    }
  }

  // Fallback to local mock
  const hashedInput = await hashKey(inputKey.replace(/\s/g, ''));
  const dbStr = localStorage.getItem(MOCK_DB_KEY);
  const db: MockAccount[] = dbStr ? JSON.parse(dbStr) : [];

  const accountIndex = db.findIndex(acc => acc.hashedKey === hashedInput);
  if (accountIndex === -1) return false;

  const currentExpiry = Math.max(Date.now(), db[accountIndex].subscriptionExpiry);
  db[accountIndex].subscriptionExpiry = currentExpiry + (1000 * 60 * 60 * 24 * 30 * months);
  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
  return true;
};

/**
 * Save session to local storage
 */
export const saveSession = (key: string, token: string, expiry: number, name?: string): void => {
  const session: Session = {
    accountNumber: key,
    token,
    subscriptionEnds: expiry,
    name,
    expiry: Date.now() + (1000 * 60 * 60 * 24), // Session valid for 24 hours
    createdAt: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

/**
 * Get current session
 * Returns session even if subscription expired (for data access)
 */
export const getSession = (): Session | null => {
  try {
    const str = localStorage.getItem(SESSION_KEY);
    if (!str) return null;

    const session: Session = JSON.parse(str);

    // Max session lifetime: 7 days without re-login
    const maxLifetime = 1000 * 60 * 60 * 24 * 7; // 7 days
    const sessionAge = Date.now() - (session.createdAt || 0);
    if (session.createdAt && sessionAge > maxLifetime) {
      // Session too old - require re-verification
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    // Session token expired within 7-day window - refresh it
    if (Date.now() > session.expiry) {
      session.expiry = Date.now() + (1000 * 60 * 60 * 24); // 24 hours
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    return session;
  } catch {
    return null;
  }
};

/**
 * Check if subscription is still active
 */
export const isSubscriptionActive = (): boolean => {
  const session = getSession();
  if (!session) return false;
  return Date.now() < session.subscriptionEnds;
};

/**
 * Check if user has any session (even expired subscription)
 * Used to determine if user should see their data
 */
export const hasExistingAccount = (): boolean => {
  return getSession() !== null;
};

/**
 * Clear session (logout)
 * Note: This only clears the session, NOT the user's food/workout data
 * User data is stored separately and remains intact
 */
export const logout = (): void => {
  localStorage.removeItem(SESSION_KEY);
  // Intentionally NOT clearing user data (nutrivault_profile, nutrivault_logs, etc.)
  // This ensures users keep their data even after logging out
};

/**
 * Check if using production backend
 */
export const isProductionMode = (): boolean => {
  return isSupabaseConfigured();
};
