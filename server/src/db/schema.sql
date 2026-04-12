CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  frame_type TEXT,
  description TEXT,
  atk INTEGER,
  def INTEGER,
  level INTEGER,
  race TEXT,
  attribute TEXT,
  archetype TEXT,
  link_val INTEGER,
  link_markers TEXT,
  scale INTEGER,
  image_url TEXT,
  image_small_url TEXT,
  image_cropped_url TEXT,
  ban_status_md TEXT,
  md_rarity TEXT,
  negate_effectiveness REAL,
  negated_win_rate REAL,
  not_negated_win_rate REAL,
  negate_sample_size INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_attribute ON cards(attribute);

CREATE TABLE IF NOT EXISTS archetypes (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS deck_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier INTEGER,
  power REAL,
  power_trend REAL,
  pop_rank INTEGER,
  master_pop_rank INTEGER,
  overview TEXT,
  thumbnail_image TEXT,
  avg_ur_price REAL,
  avg_sr_price REAL,
  breakdown_json TEXT,
  win_rate REAL,
  play_rate REAL,
  sample_size INTEGER,
  untapped_tier INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS top_decks (
  id TEXT PRIMARY KEY,
  deck_type_name TEXT,
  author TEXT,
  main_deck_json TEXT,
  extra_deck_json TEXT,
  side_deck_json TEXT,
  tournament_name TEXT,
  tournament_placement TEXT,
  ranked_type TEXT,
  created_at TEXT,
  gems_price INTEGER,
  ur_price INTEGER,
  sr_price INTEGER,
  url TEXT,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT,
  short_name TEXT,
  banner_image TEXT,
  next_date TEXT,
  placements_json TEXT,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS meta_snapshots (
  id SERIAL PRIMARY KEY,
  deck_type_name TEXT NOT NULL,
  tier INTEGER,
  power REAL,
  pop_rank INTEGER,
  snapshot_date TEXT NOT NULL,
  UNIQUE(deck_type_name, snapshot_date)
);

CREATE TABLE IF NOT EXISTS matchups (
  deck_a TEXT,
  deck_b TEXT,
  win_rate_a REAL,
  sample_size INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  PRIMARY KEY (deck_a, deck_b)
);

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  data TEXT,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_log (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  detail TEXT,
  synced_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS matchup_sources (
  deck_a TEXT NOT NULL,
  deck_b TEXT NOT NULL,
  source TEXT NOT NULL,
  win_rate REAL NOT NULL,
  sample_size INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  PRIMARY KEY (deck_a, deck_b, source)
);
