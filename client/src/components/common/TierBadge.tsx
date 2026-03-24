import clsx from 'clsx';

const tierConfig: Record<string, { label: string; bg: string; text: string; border: string; glow: string }> = {
  '0': { label: 'Tier 0', bg: 'bg-tier-0/12', text: 'text-tier-0', border: 'border-tier-0/25', glow: 'tier-glow-0' },
  '1': { label: 'Tier 1', bg: 'bg-tier-1/12', text: 'text-tier-1', border: 'border-tier-1/25', glow: 'tier-glow-1' },
  '2': { label: 'Tier 2', bg: 'bg-tier-2/12', text: 'text-tier-2', border: 'border-tier-2/25', glow: 'tier-glow-2' },
  '3': { label: 'Tier 3', bg: 'bg-tier-3/12', text: 'text-tier-3', border: 'border-tier-3/25', glow: 'tier-glow-3' },
  rogue: { label: 'Rogue', bg: 'bg-tier-rogue/10', text: 'text-tier-rogue', border: 'border-tier-rogue/15', glow: '' },
};

export default function TierBadge({ tier, size = 'md' }: { tier: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const key = tier != null ? String(tier) : 'rogue';
  const cfg = tierConfig[key] || tierConfig.rogue;
  const sizeClass = size === 'sm'
    ? 'text-[10px] px-2 py-0.5'
    : size === 'lg'
    ? 'text-sm px-3 py-1.5'
    : 'text-xs px-2.5 py-1';

  return (
    <span className={clsx(
      'rounded-md font-semibold inline-block border tracking-wide',
      cfg.bg, cfg.text, cfg.border, cfg.glow, sizeClass
    )}>
      {cfg.label}
    </span>
  );
}
