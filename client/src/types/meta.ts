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
  negated_win_rate: number | null;
  not_negated_win_rate: number | null;
  negate_sample_size: number | null;
}

export interface BanListData {
  forbidden: BanCard[];
  limited: BanCard[];
  semiLimited: BanCard[];
}

// ── Ecosystem / Predator-Prey types ──

export interface PredatorPreyRelationship {
  predator: string;
  prey: string;
  win_rate: number;
  strength: 'hard_counter' | 'soft_counter' | 'slight_edge';
  meta_impact: number;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
  mechanism: 'direct' | 'inferred';
}

export interface GameTheoryProfile {
  expected_payoff: number;
  nash_deviation: number;
  best_response_to: string | null;
  dominated_by: string[];
  dominates: string[];
  strategy_type: 'dominant' | 'counter_pick' | 'generalist' | 'niche' | 'dominated';
}

export interface TournamentFieldEntry {
  deck: string;
  field_pct: number;
  top_cut_pct: number;
  conversion_rate: number;
  appearances: number;
}

export interface DeckEcosystemProfile {
  deck: string;
  tier: number | null;
  power: number | null;
  win_rate: number | null;
  play_rate: number | null;
  predators: PredatorPreyRelationship[];
  prey: PredatorPreyRelationship[];
  neutral: string[];
  polarization_index: number;
  suppression_score: number;
  vulnerability_score: number;
  meta_fitness: number;
  matchup_spread: number;
  game_theory: GameTheoryProfile;
}

export interface RockPaperScissorsCycle {
  decks: string[];
  cycle_strength: number;
  meta_relevance: number;
}

export interface EcosystemAnalysis {
  profiles: DeckEcosystemProfile[];
  cycles: RockPaperScissorsCycle[];
  food_chain: PredatorPreyRelationship[];
  meta_health_index: number;
  tournament_field: TournamentFieldEntry[];
  nash_equilibrium: Record<string, number>;
  computed_at: string;
}

export interface DeckEcosystemResponse {
  profile: DeckEcosystemProfile | null;
  related_cycles: RockPaperScissorsCycle[];
  meta_health_index: number;
  computed_at: string;
}
