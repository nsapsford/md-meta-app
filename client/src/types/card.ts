export interface Card {
  id: number;
  name: string;
  type: string;
  frame_type: string;
  description: string;
  atk: number | null;
  def: number | null;
  level: number | null;
  race: string;
  attribute: string | null;
  archetype: string | null;
  link_val: number | null;
  link_markers: string | null;
  scale: number | null;
  image_url: string;
  image_small_url: string;
  image_cropped_url: string;
  ban_status_md: string | null;
  md_rarity: string | null;
  negate_effectiveness: number | null;
  negated_win_rate: number | null;
  not_negated_win_rate: number | null;
  negate_sample_size: number | null;
}

export interface CardSearchResult {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited' | null;
