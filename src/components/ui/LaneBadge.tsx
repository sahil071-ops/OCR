'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { ProcessingLane } from '@/types';
import { LANE_LABELS } from '@/types';

interface LaneBadgeProps {
  lane?: ProcessingLane | null;
  className?: string;
  showIcon?: boolean;
}

const LANE_STYLES: Record<ProcessingLane, string> = {
  UNKNOWN:    'bg-gray-100 text-gray-500',
  PDF_NATIVE: 'bg-green-100 text-green-700',
  OCR_ONLY:   'bg-emerald-100 text-emerald-700',
  AI_CHEAP:   'bg-yellow-100 text-yellow-700',
  AI_STRONG:  'bg-red-100 text-red-700',
};

const LANE_ICONS: Record<ProcessingLane, string> = {
  UNKNOWN:    '⏳',
  PDF_NATIVE: '📄',
  OCR_ONLY:   '🔍',
  AI_CHEAP:   '✨',
  AI_STRONG:  '🤖',
};

export function LaneBadge({ lane, className, showIcon = true }: LaneBadgeProps) {
  const key = (lane || 'UNKNOWN') as ProcessingLane;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        LANE_STYLES[key],
        className
      )}
      title={getLaneTooltip(key)}
    >
      {showIcon && <span aria-hidden>{LANE_ICONS[key]}</span>}
      {LANE_LABELS[key]}
    </span>
  );
}

function getLaneTooltip(lane: ProcessingLane): string {
  switch (lane) {
    case 'PDF_NATIVE':  return 'Extracted from native PDF text – no OCR or AI cost';
    case 'OCR_ONLY':    return 'Extracted via PaddleOCR – no AI cost';
    case 'AI_CHEAP':    return 'OCR + Claude Haiku rescue – small AI cost';
    case 'AI_STRONG':   return 'OCR + Claude Sonnet escalation – higher AI cost';
    default:            return 'Not yet processed';
  }
}
