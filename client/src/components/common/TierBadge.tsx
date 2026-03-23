import clsx from 'clsx';

const tierConfig: Record<string, { label: string; bg: string; text: string; glow: string }> = {
  '0': { label: 'Tier 0', bg: 'bg-tier-0/20', text: 'text-tier-0', glow: 'tier-glow-0' },
  '1': { label: 'Tier 1', bg: 'bg-tier-1/20', text: 'text-tier-1', glow: 'tier-glow-1' },
  '2': { label: 'Tier 2', bg: 'bg-tier-2/20', text: 'text-tier-2', glow: 'tier-glow-2' },
  '3': { label: 'Tier 3', bg: 'bg-tier-3/20', text: 'text-tier-3', glow: 'tier-glow-3' },
  rogue: { label: 'Rogue', bg: 'bg-tier-rogue/20', text: 'text-tier-rogue', glow: '' },
};

export default function TierBadge({ tier, size = 'md' }: { tier: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const key = tier != null ? String(tier) : 'rogue';
  const cfg = tierConfig[key] || tierConfig.rogue;
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : size === 'lg' ? 'text-base px-3 py-1.5' : 'text-sm px-2 py-1';

  return (
    <span className={clsx('rounded font-semibold inline-block', cfg.bg, cfg.text, cfg.glow, sizeClass)}>
      {cfg.label}
    </span>
  );
}
