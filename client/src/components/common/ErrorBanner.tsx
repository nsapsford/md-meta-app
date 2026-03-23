export default function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-md-red/10 border border-md-red/30 rounded-lg p-4 flex items-center justify-between">
      <span className="text-md-red">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1 bg-md-red/20 hover:bg-md-red/30 rounded text-sm transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}
