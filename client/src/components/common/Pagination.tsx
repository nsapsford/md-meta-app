import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  const btnBase = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200';

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} bg-md-surface border border-md-border disabled:opacity-25 hover:bg-md-surfaceHover text-md-textMuted`}
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={clsx(
            btnBase,
            p === page
              ? 'bg-md-blue/15 text-md-blue border border-md-blue/25'
              : 'bg-md-surface border border-md-border text-md-textMuted hover:bg-md-surfaceHover hover:text-md-text'
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} bg-md-surface border border-md-border disabled:opacity-25 hover:bg-md-surfaceHover text-md-textMuted`}
      >
        Next
      </button>
    </div>
  );
}
