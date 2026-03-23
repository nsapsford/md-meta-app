export const config = {
  port: parseInt(process.env.PORT || '3001'),
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
