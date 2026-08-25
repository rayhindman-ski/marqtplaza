import React from 'react';
import { cn } from '../lib/utils';

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

/**
 * The source PNG has transparent padding around the artwork. The wrapper
 * keeps that padding from shrinking the visible logo in compact headers.
 */
export default function BrandLogo({
  className,
  imageClassName,
  alt = 'marqtplaza.com — The Digital Village Square',
}: BrandLogoProps) {
  return (
    <span className={cn('relative block h-16 w-64 overflow-hidden', className)}>
      <img
        src="/marqtplaza-logo.png"
        alt={alt}
        className={cn('absolute left-0 top-1/2 w-full max-w-none -translate-y-1/2', imageClassName)}
      />
    </span>
  );
}