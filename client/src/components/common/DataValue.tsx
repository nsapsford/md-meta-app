import clsx from 'clsx';

interface DataValueProps {
  value: number | null | undefined;
  format?: 'percent' | 'number';
  confidence?: 'high' | 'medium' | 'low';
  inferred?: boolean;
  inference_method?: string;
  n_untapped?: number;
  n_tournament?: number;
  freshness_age_hours?: number;
  className?: string;
}

export default function DataValue({
  value,
  format = 'percent',
  confidence = 'high',
  inferred = false,
  inference_method,
  n_untapped = 0,
  n_tournament = 0,
  freshness_age_hours,
  className,
}: DataValueProps) {
  if (value === null || value === undefined) {
    return <span className="text-md-textMuted text-xs">—</span>;
  }

  // Format the value
  let displayValue: string;
  if (format === 'percent') {
    displayValue = `${(value * 100).toFixed(0)}%`;
  } else {
    displayValue = value.toFixed(1);
  }

  // Confidence styling
  const confidenceClass = confidence === 'high'
    ? 'text-md-green'
    : confidence === 'medium'
    ? 'text-md-orange'
    : 'text-md-red';

  // Base classes
  const baseClasses = clsx(
    'inline-flex items-center',
    className,
  );

  // Build tooltip content
  const tooltipParts: string[] = [];
  if (inferred) {
    tooltipParts.push(`Inferred (${inference_method ?? 'inferred'})`);
  }
  tooltipParts.push(`Confidence: ${confidence}`);
  if (n_untapped > 0 || n_tournament > 0) {
    tooltipParts.push(`Untapped n=${n_untapped}, Tournament n=${n_tournament}`);
  }
  if (freshness_age_hours !== undefined) {
    const hours = Math.floor(freshness_age_hours);
    const mins = Math.floor((freshness_age_hours % 1) * 60);
    tooltipParts.push(`Updated: ${hours}h ${mins}m ago`);
  }
  const tooltip = tooltipParts.join(' | ');

  return (
    <span
      className={baseClasses}
      title={tooltip}
      style={{
        opacity: inferred ? 0.65 : 1,
        textDecoration: inferred ? 'underline dashed' : 'none',
        textDecorationColor: inferred ? 'currentColor' : undefined,
      }}
    >
      <span className={clsx('font-semibold', confidenceClass)}>
        {displayValue}
      </span>
      {confidence === 'low' && (
        <span className="ml-1 text-xs text-md-textMuted">◆</span>
      )}
    </span>
  );
}
