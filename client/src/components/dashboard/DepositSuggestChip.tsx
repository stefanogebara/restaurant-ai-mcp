import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';

interface DepositSuggestChipProps {
  /** Backend signal: true when the reservation is risky AND the
   *  restaurant accepts deposits AND none has been collected yet. */
  suggested?: boolean;
  /** Optional human-readable explanation (very_high_no_show_risk, etc.).
   *  Surfaced as tooltip text. */
  reason?: string | null;
  /** Click handler — opens the deposit-request flow (link/QR for guest). */
  onRequestDeposit?: () => void;
}

/**
 * Phase AA — surfaced when the backend's deposit_suggested flag is true.
 *
 * Visually similar to NoShowRiskBadge but action-oriented: this chip is
 * a button. Clicking it opens the existing deposit-request flow so the
 * host can send the customer a payment link without leaving the row.
 *
 * Renders nothing when `suggested` is falsy so it's safe to drop into
 * every reservation card unconditionally.
 */
export default function DepositSuggestChip({
  suggested,
  reason,
  onRequestDeposit,
}: DepositSuggestChipProps) {
  const { t } = useTranslation();
  if (!suggested) return null;

  const tooltip = reason
    ? t(
        `dashboard.depositSuggest.reason.${reason}`,
        humanizeReason(reason),
      )
    : t('dashboard.depositSuggest.tooltip', 'High no-show risk — consider asking for a deposit');

  const label = t('dashboard.depositSuggest.label', 'Request deposit');

  // Render as a button only when there's a click handler. Otherwise it's
  // a passive informational chip (e.g. when the dashboard surface that
  // owns the action doesn't pass a handler in yet).
  const className =
    'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-600/[10%] text-amber-700 hover:bg-amber-600/[18%] transition-colors';

  if (onRequestDeposit) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // Stop the click bubbling up into the reservation card's own
          // click handler (e.g. opening the edit drawer).
          e.stopPropagation();
          onRequestDeposit();
        }}
        title={tooltip}
        aria-label={label}
        className={className}
      >
        <ThiingsIcon name="credit-card" pxSize={15} className="text-warm-stone" />
        {label}
      </button>
    );
  }

  return (
    <span className={className.replace('hover:bg-amber-600/[18%] transition-colors', '')} title={tooltip}>
      <ThiingsIcon name="credit-card" pxSize={15} className="text-warm-stone" />
      {label}
    </span>
  );
}

/** Fallback humanizer for reasons we haven't translated yet. */
function humanizeReason(reason: string): string {
  if (reason === 'very_high_no_show_risk') return 'Very high no-show risk — request a deposit';
  if (reason === 'high_no_show_risk') return 'High no-show risk — request a deposit';
  if (reason.startsWith('risk_score_')) {
    const score = reason.match(/risk_score_(\d+)/)?.[1];
    return score
      ? `No-show risk ${score}% — above deposit-suggest threshold`
      : 'No-show risk above deposit-suggest threshold';
  }
  return 'Consider requesting a deposit';
}
