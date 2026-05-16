/**
 * Shared status-color legend.
 *
 * Audit findings 4 + 6 surfaced two related problems:
 *   - Status pills across the platform used a different color convention
 *     in every component (Confirmed was rose in ReservationsList but
 *     burgundy in TableLayoutPanel; "Live" indicator dots looked identical
 *     to status badges).
 *   - There was no inline legend anywhere — Carla had to memorise the code.
 *
 * The canonical semantic palette (used everywhere status is conveyed):
 *
 *   GOOD       emerald  → available, confirmed (will arrive), open for booking
 *   ACTIVE     blue     → seated, in service, dining
 *   WARN       amber    → at-risk, awaiting confirmation, deposit pending
 *   DANGER     red      → no-show, canceled, hard error
 *   NEUTRAL    stone    → past, completed, closed
 *
 * Helper `tokenForStatus()` resolves a semantic token to a Tailwind triple
 * (dot bg + chip bg + chip text) so any badge can be re-skinned by setting
 * its semantic key instead of hand-picking colors.
 */

import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

export type SemanticStatusToken = 'good' | 'active' | 'warn' | 'danger' | 'neutral';

interface PaletteTriple {
  dot: string;       // for w-2 h-2 rounded-full dot
  chipBg: string;    // surrounding chip background
  chipText: string;  // chip text color
}

export const STATUS_PALETTE: Record<SemanticStatusToken, PaletteTriple> = {
  good:    { dot: 'bg-emerald-500', chipBg: 'bg-emerald-50',  chipText: 'text-emerald-700' },
  active:  { dot: 'bg-blue-500',    chipBg: 'bg-blue-50',     chipText: 'text-blue-700' },
  warn:    { dot: 'bg-amber-500',   chipBg: 'bg-amber-50',    chipText: 'text-amber-700' },
  danger:  { dot: 'bg-red-500',     chipBg: 'bg-red-50',      chipText: 'text-red-700' },
  neutral: { dot: 'bg-stone-400',   chipBg: 'bg-stone-100',   chipText: 'text-stone-700' },
};

/**
 * Compose a Tailwind classname for a status pill from a semantic token.
 * Returns chip + text classes — the caller controls padding / shape.
 */
export function chipClassesForStatus(token: SemanticStatusToken): string {
  const p = STATUS_PALETTE[token];
  return `${p.chipBg} ${p.chipText}`;
}

export function dotClassForStatus(token: SemanticStatusToken): string {
  return STATUS_PALETTE[token].dot;
}

export interface StatusLegendItem {
  /** Translation key OR plain label — if it contains a dot, treated as a key */
  label: string;
  token: SemanticStatusToken;
  /** Optional inline icon (small) instead of the colored dot */
  icon?: ReactNode;
}

interface StatusLegendProps {
  items: StatusLegendItem[];
  /** Optional leading label like "Status:" — translation key or plain text */
  caption?: string;
  className?: string;
}

export default function StatusLegend({ items, caption, className = '' }: StatusLegendProps) {
  const { t } = useTranslation();
  const resolveLabel = (s: string) =>
    /\./.test(s) ? t(s, s.split('.').pop() ?? s) : s;

  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      {caption && (
        <span className="text-xs text-stone-gray font-medium">{resolveLabel(caption)}</span>
      )}
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          {item.icon ?? <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClassForStatus(item.token)}`} />}
          <span className="text-xs text-stone-gray">{resolveLabel(item.label)}</span>
        </div>
      ))}
    </div>
  );
}
