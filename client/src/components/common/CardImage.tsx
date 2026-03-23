import { useState } from 'react';
import clsx from 'clsx';

interface CardImageProps {
  src: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export default function CardImage({ src, alt, size = 'md', className, onClick }: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const sizeClass = size === 'sm' ? 'w-16 h-24' : size === 'lg' ? 'w-40 h-58' : 'w-24 h-36';

  return (
    <div
      className={clsx('relative rounded overflow-hidden bg-md-surface', sizeClass, onClick && 'cursor-pointer card-hover', className)}
      onClick={onClick}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={clsx('w-full h-full object-cover transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-md-textMuted text-xs text-center p-1">
          {alt}
        </div>
      )}
    </div>
  );
}
