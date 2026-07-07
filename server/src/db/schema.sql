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
  pop_rank REAL,
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

CREATE TABLE IF NOT EXISTS personal_games (
  id SERIAL PRIMARY KEY,
  deck_played TEXT NOT NULL,
  opponent_deck TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  went_first BOOLEAN,
  notes TEXT,
  played_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE INDEX IF NOT EXISTS idx_personal_games_played_at ON personal_games(played_at);
CREATE INDEX IF NOT EXISTS idx_personal_games_matchup ON personal_games(deck_played, opponent_deck);

-- Pre-computed card images per deck type (populated by computeDeckTypeCards during sync)
-- Stored as JSON array: [{name, image}] up to 5 entries
-- This allows the tier-list endpoint to run as a single SELECT with no joins
ALTER TABLE deck_types ADD COLUMN IF NOT EXISTS computed_cards_json TEXT;

-- 'quick' dossiers use a faster model and a terser prompt for low-latency,
-- mid-duel use; 'detailed' is the original thorough treatment.
ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS depth TEXT NOT NULL DEFAULT 'detailed';

-- Indexes for tier-list performance (window function + card image lookups)
CREATE INDEX IF NOT EXISTS idx_top_decks_name_lower ON top_decks(LOWER(deck_type_name));
CREATE INDEX IF NOT EXISTS idx_top_decks_created ON top_decks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_name_lower ON cards(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_cards_archetype_lower ON cards(LOWER(archetype));

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,   -- scrypt, format: salt_hex:hash_hex
  created_at    INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

CREATE TABLE IF NOT EXISTS user_decks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  archetype   TEXT,
  main_json   TEXT NOT NULL,   -- JSON: [{ "passcode": <int>, "count": <int> }]
  extra_json  TEXT,
  side_json   TEXT,
  source      TEXT,            -- 'manual' | 'ydk' | 'neuron-url' | 'ocr'
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Duel Companion: versioned AI-generated dossiers. 'opponent' dossiers are
-- keyed by archetype (matching deck_types.name); 'pilot' dossiers are keyed
-- to a specific saved deck so lines match the user's exact list. Regeneration
-- inserts a new version rather than overwriting; a failed generation is
-- recorded but never becomes the version served to the client.
CREATE TABLE IF NOT EXISTS dossiers (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('opponent', 'pilot')),
  archetype TEXT,
  deck_id INTEGER REFERENCES user_decks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  model TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'detailed',
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  error TEXT,
  generated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  CHECK (
    (kind = 'opponent' AND archetype IS NOT NULL AND deck_id IS NULL) OR
    (kind = 'pilot' AND deck_id IS NOT NULL AND archetype IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dossiers_opponent_lookup
  ON dossiers(LOWER(archetype), version DESC) WHERE kind = 'opponent';
CREATE INDEX IF NOT EXISTS idx_dossiers_pilot_lookup
  ON dossiers(deck_id, version DESC) WHERE kind = 'pilot';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dossiers_opponent_version_unique
  ON dossiers(LOWER(archetype), version) WHERE kind = 'opponent';
CREATE UNIQUE INDEX IF NOT EXISTS idx_dossiers_pilot_version_unique
  ON dossiers(deck_id, version) WHERE kind = 'pilot';

-- Personal notes layered onto a dossier. category slots the note into the
-- matching dossier section in the UI. game_id is unused until Phase 2 (review
-- loop) but included now to avoid a later migration.
CREATE TABLE IF NOT EXISTS dossier_notes (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('opponent', 'pilot')),
  archetype TEXT,
  deck_id INTEGER REFERENCES user_decks(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('negate-priority', 'play-around', 'combo-line', 'general')),
  note TEXT NOT NULL,
  game_id INTEGER REFERENCES personal_games(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  CHECK (
    (kind = 'opponent' AND archetype IS NOT NULL AND deck_id IS NULL) OR
    (kind = 'pilot' AND deck_id IS NOT NULL AND archetype IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dossier_notes_opponent ON dossier_notes(LOWER(archetype)) WHERE kind = 'opponent';
CREATE INDEX IF NOT EXISTS idx_dossier_notes_pilot ON dossier_notes(deck_id) WHERE kind = 'pilot';
