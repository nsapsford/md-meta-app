// Canonical tier palette — mirrors `tier` tokens in tailwind.config.ts
export const TIER_COLORS = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#6b7694'] as const;
export const ROGUE_INDEX = 4;

export function tierHex(tier: number | null | undefined): string {
  return TIER_COLORS[tier ?? ROGUE_INDEX] ?? TIER_COLORS[ROGUE_INDEX];
}
