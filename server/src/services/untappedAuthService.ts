import axios from 'axios';

const KEYTAR_SERVICE = 'Untapped Companion';
const TOKEN_URL = 'https://api.ygom.untapped.gg/o/token';
const CLIENT_ID = 'Iin3tp4hpdfUT0DZT0EXX6S0CDPSEqJi1Rl9R0Oc';

let cachedAccessToken: string | null = null;

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
    console.log('[UntappedAuth] Access token refreshed successfully');
    return newToken;
  } catch (err: any) {
    console.warn('[UntappedAuth] Token refresh failed:', err.response?.data ?? err.message);
    return null;
  }
}

/**
 * Returns a valid access token, refreshing if necessary.
 * Returns null if the Untapped Companion is not installed/logged in.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;

  const creds = await getStoredCredentials();
  if (!creds) return null;

  if (creds.accessToken) {
    cachedAccessToken = creds.accessToken;
    return cachedAccessToken;
  }

  if (creds.refreshToken) {
    const fresh = await refreshAccessToken(creds.refreshToken);
    if (fresh) {
      cachedAccessToken = fresh;
      return cachedAccessToken;
    }
  }

  console.warn('[UntappedAuth] No usable token found — companion may need to be re-authenticated');
  return null;
}

/** Clears the cached token so the next call re-reads from keytar or refreshes */
export function invalidateToken(): void {
  cachedAccessToken = null;
}
