export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${s} border-2 border-md-border border-t-md-gold rounded-full animate-spin`} />
    </div>
  );
}
