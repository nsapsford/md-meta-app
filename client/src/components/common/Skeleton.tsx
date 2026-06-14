import clsx from 'clsx';

// Base shimmer block. Reuses the .skeleton-pulse class already defined in
// index.css so every skeleton shares one animation.
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton-pulse rounded-md', className)} />;
}

// Skeleton for the Matchups win-rate matrix: a header row of deck chips plus a
// grid of cells, mirroring the real table's shape so there's no layout jump.
export function MatchupMatrixSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-md-border/40 bg-md-surface/40 p-3">
      <div className="flex gap-2 mb-2">
        <Skeleton className="w-28 h-7 flex-shrink-0" />
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-7" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-2">
            <Skeleton className="w-28 h-9 flex-shrink-0" />
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="flex-1 h-9" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for the Trends page: a faux line-chart panel (rounded block with a
// baseline of varied bars) plus a few table rows.
export function TrendsSkeleton() {
  const bars = [55, 70, 45, 80, 60, 90, 50, 75, 65, 85];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-md-border/40 bg-md-surface/40 p-4">
        <Skeleton className="w-40 h-5 mb-4" />
        <div className="flex items-end gap-2 h-48">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 flex items-end h-full">
              <div className="skeleton-pulse rounded-md w-full" style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-6 h-6 rounded-full" />
            <Skeleton className="flex-1 h-8" />
            <Skeleton className="w-16 h-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
