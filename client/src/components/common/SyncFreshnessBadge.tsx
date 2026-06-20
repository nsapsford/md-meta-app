import type { SyncRecord } from '../../api/sync';

interface Props {
  records: SyncRecord[];
  sources?: string[]; // which sources are relevant to this page
  updating?: boolean; // a pull-only refresh is in flight
}

export default function SyncFreshnessBadge({ records, sources, updating }: Props) {
  if (updating) {
    return (
      <span className="inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-xs font-medium bg-md-gold/10 border-md-gold/20 text-md-gold">
        <span className="w-2.5 h-2.5 border-2 border-md-gold/30 border-t-md-gold rounded-full animate-spin" />
        Updating…
      </span>
    );
  }

  const relevant = sources
    ? records.filter((r) => sources.includes(r.source))
    : records;

  if (relevant.length === 0) return null;

  const hasFailed = relevant.some((r) => r.status === 'failed');
  const hasPartial = relevant.some((r) => r.status === 'partial');
  const oldestSyncedAt = Math.min(...relevant.map((r) => r.synced_at)) || 0;
  const ageHrs = (Date.now() / 1000 - oldestSyncedAt) / 3600;

  let label: string;
  let classes: string;

  if (hasFailed) {
    label = '● Sync failed';
    classes = 'bg-md-red/10 border-md-red/20 text-md-red';
  } else if (ageHrs > 12) {
    label = `● ${Math.floor(ageHrs)}h ago`;
    classes = 'bg-md-red/10 border-md-red/20 text-md-red';
  } else if (hasPartial || ageHrs > 2) {
    const mins = Math.floor(ageHrs * 60);
    label = ageHrs < 1 ? `● ${mins}m ago` : `● ${Math.floor(ageHrs)}h ago`;
    classes = 'bg-md-orange/10 border-md-orange/20 text-md-orange';
  } else {
    const mins = Math.floor(ageHrs * 60);
    label = mins < 60 ? `● ${mins}m ago` : `● ${Math.floor(ageHrs)}h ago`;
    classes = 'bg-md-green/10 border-md-green/20 text-md-green';
  }

  return (
    <span className={`inline-flex items-center border rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
