export interface TierList {
  '0': DeckTierEntry[];
  '1': DeckTierEntry[];
  '2': DeckTierEntry[];
  '3': DeckTierEntry[];
  rogue: DeckTierEntry[];
}

export interface DeckTierEntry {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  pop_rank: number | null;
  master_pop_rank: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  sample_size: number | null;
  untapped_tier: number | null;
  cards?: Array<{ name: string; image: string | null }>;
}

export interface MetaSnapshot {
  deck_type_name: string;
  tier: number | null;
  power: number | null;
  pop_rank: number | null;
  snapshot_date: string;
}

export interface Matchup {
  deck_a: string;
  deck_b: string;
  win_rate_a: number;
  sample_size: number;
}

export interface Tournament {
  id: string;
  name: string;
  short_name: string | null;
  banner_image: string | null;
  next_date: string | null;
  placements_json: any[] | null;
  winner_deck_thumbnail: string | null;
  winner_deck_name: string | null;
}

export interface TournamentResult {
  deck_type_name: string;
  tournament_placement: string;
  author: string | null;
  created_at: string | null;
  url: string | null;
}

export interface BanCard {
  name: string;
  banStatus: string;
  rarity: string | null;
  konamiID: string | null;
  banListDate: string | null;
  id: number | null;
  image_small_url: string | null;
  image_cropped_url: string | null;
  negate_effectiveness: number | null;
}

export interface BanListData {
  forbidden: BanCard[];
  limited: BanCard[];
  semiLimited: BanCard[];
}
