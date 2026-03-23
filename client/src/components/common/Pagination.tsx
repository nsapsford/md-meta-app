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

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded bg-md-surface border border-md-border disabled:opacity-30 hover:bg-md-surfaceHover transition-colors text-sm"
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={clsx(
            'px-3 py-1.5 rounded text-sm transition-colors',
            p === page ? 'bg-md-blue text-white' : 'bg-md-surface border border-md-border hover:bg-md-surfaceHover'
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded bg-md-surface border border-md-border disabled:opacity-30 hover:bg-md-surfaceHover transition-colors text-sm"
      >
        Next
      </button>
    </div>
  );
}
