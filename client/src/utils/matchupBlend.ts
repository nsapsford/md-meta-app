export interface MatchupSource {
  rate: number;
  n: number;
}

export interface BlendResult {
  rate: number;
  confidence: 'high' | 'medium' | 'low';
}

export function blendMatchupRates(
  untapped: MatchupSource | null,
  tournament: MatchupSource | null,
  weights = { untapped: 0.7, tournament: 0.3 }
): BlendResult {
  if (!untapped && !tournament) return { rate: 0.5, confidence: 'low' };
  if (!untapped) return { rate: tournament!.rate, confidence: tournament!.n >= 30 ? 'medium' : 'low' };
  if (!tournament) return { rate: untapped.rate, confidence: untapped.n >= 100 ? 'high' : 'medium' };
  const rate = untapped.rate * weights.untapped + tournament.rate * weights.tournament;
  return { rate, confidence: 'high' };
}
