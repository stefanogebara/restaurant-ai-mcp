/**
 * Tiny "$2.43 this month" pill that lives in the drafter header next
 * to the language indicator. Surfaces what the restaurant has spent
 * on AI image + video generation so the bill doesn't blindside them.
 *
 * Hidden when total === 0 (don't clutter the UI for restaurants who
 * haven't tried gen yet). Refetches on window focus + 60s stale time.
 */
import { useQuery } from '@tanstack/react-query';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';

interface GenSpend {
  ok: boolean;
  month: { total_cents: number; by_kind: { image: number; video: number }; gen_count: number };
  all_time: { total_cents: number; gen_count: number };
}

const QUERY_KEY = ['instagram-gen-spend'] as const;

function formatUSD(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function InstagramGenSpendPill() {
  const { t } = useTranslation();
  const { data } = useQuery<GenSpend, Error>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch('/api/instagram/gen-spend', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!data?.ok) return null;
  const monthTotal = data.month.total_cents;
  if (monthTotal === 0) return null;  // hide until there's spend to show

  const { image, video } = data.month.by_kind;
  const tooltipLines = [
    t('instagram.spendPill.month', `${formatUSD(monthTotal)} this month`),
    `${data.month.gen_count} generation${data.month.gen_count === 1 ? '' : 's'}`,
    image > 0 ? `${formatUSD(image)} images` : null,
    video > 0 ? `${formatUSD(video)} videos` : null,
    data.all_time.total_cents !== monthTotal
      ? `${formatUSD(data.all_time.total_cents)} all-time`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-warm-white border border-glass-border-dark text-muted-stone"
      title={tooltipLines}
      data-testid="instagram-gen-spend-pill"
    >
      <ThiingsIcon name="sparkles" pxSize={15} className="text-ocre-600" />
      <span>
        {formatUSD(monthTotal)}{' '}
        <span className="text-deep-charcoal/60">this month</span>
      </span>
    </span>
  );
}
