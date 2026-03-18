import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface UsageData {
  used: number;
  limit: number | null;
  plan: string;
  resets_at: string;
}

export default function ManagerAIUsageBar() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery<UsageData>({
    queryKey: ['manager-usage'],
    queryFn: () => api.get('/manager-usage').then((r) => r.data),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (!data) return null;

  const { used, limit, resets_at } = data;

  // Scale plan: unlimited
  if (limit === null) {
    return (
      <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1">
        <span className="text-rose-500">●</span>
        <span>{t('managerAI.title', 'Manager AI')} — {t('managerAI.unlimited', 'Unlimited')}</span>
      </div>
    );
  }

  const pct = Math.min((used / limit) * 100, 100);
  const isWarning = pct >= 80;
  const isExhausted = used >= limit;

  const barColor = isExhausted
    ? 'bg-red-500'
    : isWarning
    ? 'bg-amber-400'
    : 'bg-blue-500';

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{t('managerAI.title', 'Manager AI')}</span>
        <span>{used} / {limit} {t('managerAI.messages', 'messages')}</span>
      </div>
      <div
        className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isWarning && (
        <p className="text-xs text-amber-600">
          {t('managerAI.runningLow', 'Running low')} ·{' '}
          <a href="/subscription/manage" className="underline hover:text-amber-700">
            {t('managerAI.upgradeFor', 'Upgrade for')} {data.plan === 'starter' ? '500' : t('managerAI.unlimited', 'unlimited')}/{t('managerAI.month', 'mo')} →
          </a>
        </p>
      )}
      {!isWarning && (
        <p className="text-xs text-gray-400">
          {t('managerAI.resets', 'Resets')} {new Date(resets_at).toLocaleDateString(i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es' : 'en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  );
}
