export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${s} border-2 border-md-border/40 border-t-md-gold rounded-full animate-spin`} />
    </div>
  );
}
