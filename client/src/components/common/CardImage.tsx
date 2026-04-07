import { useState } from 'react';
import clsx from 'clsx';

interface CardImageProps {
  src: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  rarity?: 'ur' | 'sr' | 'r' | 'n';
  showRarityBorder?: boolean;
}

export default function CardImage({
  src,
  alt,
  size = 'md',
  className,
  onClick,
  rarity,
  showRarityBorder = false
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const sizeClasses = {
    xs: 'w-12 h-18',
    sm: 'w-16 h-24',
    md: 'w-24 h-36',
    lg: 'w-40 h-58'
  };

  const rarityColors = {
    ur: 'border-rarity-ur',
    sr: 'border-rarity-sr',
    r: 'border-rarity-r',
    n: 'border-rarity-n'
  };

  const borderClass = showRarityBorder && rarity
    ? `border-2 ${rarityColors[rarity]} shadow-lg`
    : 'border border-md-border';

  return (
    <div
      className={clsx(
        'relative rounded-lg overflow-hidden bg-gradient-to-br from-md-surface to-md-bg',
        sizeClasses[size],
        borderClass,
        onClick && 'cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-card-hover hover:z-10',
        'group',
        className
      )}
    >
      {src && !error ? (
        <>
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            className={clsx(
              'w-full h-full object-cover transition-all duration-500',
              loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
          <div className="w-8 h-8 rounded-full bg-md-surface border border-md-border flex items-center justify-center mb-2">
            <svg className="w-4 h-4 text-md-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="text-[9px] text-md-textMuted leading-tight">{alt}</span>
        </div>
      )}

      {/* Shine effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
      </div>
    </div>
  );
}