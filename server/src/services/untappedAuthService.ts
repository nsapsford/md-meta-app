import axios from 'axios';
import { getCached, setCache } from './cacheService.js';

const KEYTAR_SERVICE = 'Untapped Companion';
const TOKEN_URL = 'https://api.ygom.untapped.gg/o/token';
const CLIENT_ID = 'Iin3tp4hpdfUT0DZT0EXX6S0CDPSEqJi1Rl9R0Oc';

let cachedAccessToken: string | null = null;
let cachedExpiresAt = 0; // epoch ms; 0 = unknown (keytar / env access token)

// Untapped's token endpoint is OAuth2 and may rotate the refresh token on every use, which would
// make UNTAPPED_REFRESH_TOKEN single-use. Each rotated token is kept here so a restart resumes
// from the newest one; the env var is only the starting point.
const REFRESH_TOKEN_KEY = 'untapped:refresh-token';
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 90;
const EXPIRY_SKEW_MS = 60_000;

// Lazy-load keytar (native module) to avoid startup crashes if not installed
let keytarModule: any = null;
async function getKeytar(): Promise<any> {
  if (keytarModule) return keytarModule;
  try {
    const mod = await import('keytar');
    // CJS module via dynamic import wraps exports in .default
    keytarModule = mod.default ?? mod;
    return keytarModule;
  } catch {
    return null;
  }
}

export async function getStoredCredentials(): Promise<{ accessToken?: string; refreshToken?: string } | null> {
  const kt = await getKeytar();
  if (!kt) {
    console.warn('[UntappedAuth] keytar not available — install it with npm install keytar');
    return null;
  }

  try {
    // Companion stores one entry per account (email), with all franchise tokens as nested JSON
    const entries = await kt.findCredentials(KEYTAR_SERVICE);
    if (!entries || entries.length === 0) {
      console.warn('[UntappedAuth] findCredentials returned empty — open the Untapped Companion app and log in first');
      return null;
    }

    const parsed = JSON.parse(entries[0].password);
    const ygom = parsed.ygomOAuthAccessToken;
    if (!ygom) {
      console.warn('[UntappedAuth] ygomOAuthAccessToken not found in stored credentials — log in to YGOM in the Untapped Companion app');
      return null;
    }

    return {
      accessToken: ygom.accessToken ?? undefined,
      refreshToken: ygom.refreshToken ?? undefined,
    };
  } catch (err: any) {
    console.warn('[UntappedAuth] Failed to read credentials from keytar:', err.message);
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const newToken = res.data?.access_token;
    if (!newToken) throw new Error('No access_token in refresh response');
    const expiresIn = Number(res.data?.expires_in);
    cachedExpiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0;

    // Keep the newest refresh token (rotated or not) for the next refresh and for restarts
    const nextRefresh: string = res.data?.refresh_token || refreshToken;
    try {
      await setCache(REFRESH_TOKEN_KEY, { token: nextRefresh }, REFRESH_TOKEN_TTL);
    } catch (e: any) {
      console.warn('[UntappedAuth] Could not persist refresh token:', e.message);
    }
    console.log('[UntappedAuth] Access token refreshed successfully');
    return newToken;
  } catch (err: any) {
    console.warn('[UntappedAuth] Token refresh failed:', err.response?.data ?? err.message);
    return null;
  }
}

/** Refresh token to use: the newest persisted one, else UNTAPPED_REFRESH_TOKEN. */
async function getRefreshToken(): Promise<string | null> {
  try {
    const saved = await getCached<{ token: string }>(REFRESH_TOKEN_KEY);
    if (saved?.token) return saved.token;
  } catch { /* DB unavailable: fall back to env */ }
  return process.env.UNTAPPED_REFRESH_TOKEN || null;
}

/**
 * Returns a valid access token, refreshing if necessary.
 * Returns null if the Untapped Companion is not installed/logged in.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (cachedAccessToken && (cachedExpiresAt === 0 || Date.now() < cachedExpiresAt - EXPIRY_SKEW_MS)) {
    return cachedAccessToken;
  }
  cachedAccessToken = null;

  // 1. Server deployments: refresh token from the environment (works without a desktop keychain)
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    const fresh = await refreshAccessToken(refreshToken);
    if (fresh) {
      cachedAccessToken = fresh;
      return cachedAccessToken;
    }
  }

  // 2. A fixed access token from the environment (short-lived; no refresh)
  if (process.env.UNTAPPED_ACCESS_TOKEN) {
    cachedAccessToken = process.env.UNTAPPED_ACCESS_TOKEN;
    cachedExpiresAt = 0;
    return cachedAccessToken;
  }

  // 3. Local development: the Untapped Companion's token from the OS keychain
  const creds = await getStoredCredentials();
  if (!creds) return null;

  if (creds.accessToken) {
    cachedAccessToken = creds.accessToken;
    cachedExpiresAt = 0;
    return cachedAccessToken;
  }

  if (creds.refreshToken) {
    const fresh = await refreshAccessToken(creds.refreshToken);
    if (fresh) {
      cachedAccessToken = fresh;
      return cachedAccessToken;
    }
  }

  console.warn('[UntappedAuth] No usable token found — set UNTAPPED_REFRESH_TOKEN, or log in to the Untapped Companion on this machine');
  return null;
}

/** Clears the cached token so the next call re-reads from keytar or refreshes */
export function invalidateToken(): void {
  cachedAccessToken = null;
  cachedExpiresAt = 0;
}
