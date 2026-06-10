import { randomBytes } from 'node:crypto';

// Known MD Forbidden & Limited list dates (YYYY-MM-DD). Used to badge movers that
// crossed a banlist boundary in the requested window.
export const MD_BANLIST_DATES: string[] = [
  '2024-01-09',
  '2024-04-09',
  '2024-07-09',
  '2024-10-08',
  '2025-01-07',
  '2025-04-08',
  '2025-07-08',
];

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  adminToken: process.env.ADMIN_TOKEN || '',
  // HMAC key for auth tokens. Falling back to a random key means tokens are
  // invalidated on restart, so set AUTH_SECRET in any real deployment.
  authSecret: process.env.AUTH_SECRET || randomBytes(32).toString('hex'),
  authTokenTtl: 60 * 60 * 24 * 30, // 30 days, in seconds
  ygoprodeckBaseUrl: 'https://db.ygoprodeck.com/api/v7',
  mdmBaseUrl: 'https://www.masterduelmeta.com/api/v1',
  mdmSiteUrl: 'https://www.masterduelmeta.com',
  untappedBaseUrl: 'https://ygom.untapped.gg',
  cache: {
    cardsTtl: 86400,       // 24 hours
    tierListTtl: 3600,     // 1 hour
    topDecksTtl: 7200,     // 2 hours
    tournamentsTtl: 7200,  // 2 hours
    matchupsTtl: 14400,    // 4 hours
    banListTtl: 86400,     // 24 hours
    untappedTtl: 10800,    // 3 hours
  },
  rateLimit: {
    ygoprodeckRps: 10,
    mdmDelayMs: 500,
  },
};
