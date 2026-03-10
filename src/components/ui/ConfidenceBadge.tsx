import React from 'react';
import { cn, confidenceBg } from '@/lib/utils';

interface ConfidenceBadgeProps {
  score: number | null | undefined;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBadge({ score, showLabel = true, className }: ConfidenceBadgeProps) {
  if (score == null) {
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500', className)}>
        {showLabel ? 'N/A' : '-'}
      </span>
    );
  }

  const pct = Math.round(score * 100);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        confidenceBg(score),
        className
      )}
      title={`Confidence: ${pct}%`}
    >
      {showLabel ? `${pct}%` : null}
      <span className={cn('ml-1 h-1.5 w-1.5 rounded-full', {
        'bg-green-500': score >= 0.85,
        'bg-yellow-500': score >= 0.6 && score < 0.85,
        'bg-red-500': score < 0.6,
      })} />
    </span>
  );
}
