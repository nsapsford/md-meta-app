export interface DeckType {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  pop_rank: number | null;
  master_pop_rank: number | null;
  overview: string | null;
  thumbnail_image: string | null;
  avg_ur_price: number | null;
  avg_sr_price: number | null;
  breakdown_json: DeckBreakdown | null;
  win_rate: number | null;
  play_rate: number | null;
  sample_size: number | null;
  untapped_tier: number | null;
}

export interface DeckBreakdown {
  main?: DeckBreakdownCard[];
  extra?: DeckBreakdownCard[];
}

export interface DeckBreakdownCard {
  cardName?: string;
  name?: string;
  amount?: number;
  percentage?: number;
  usage?: number;
  rarity?: string;
}

export interface TopDeck {
  id: string;
  deck_type_name: string;
  author: string | null;
  main_deck_json: EnrichedDeckCard[] | null;
  extra_deck_json: EnrichedDeckCard[] | null;
  side_deck_json: EnrichedDeckCard[] | null;
  tournament_name: string | null;
  tournament_placement: string | null;
  ranked_type: string | null;
  created_at: string | null;
  gems_price: number | null;
  ur_price: number | null;
  sr_price: number | null;
}

export interface DeckCard {
  cardName: string;
  amount: number;
  rarity?: string;
}

export interface EnrichedDeckCard extends DeckCard {
  imageUrl?: string | null;
  type?: string | null;
  frameType?: string | null;
  archetype?: string | null;
  negate_effectiveness?: number | null;
  negated_win_rate?: number | null;
  not_negated_win_rate?: number | null;
  negate_sample_size?: number | null;
}

export interface DeckProfile extends DeckType {
  topDecks: TopDeck[];
}
