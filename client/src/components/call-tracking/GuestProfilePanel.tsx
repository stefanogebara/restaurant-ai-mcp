import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import { getSentimentColor, getOutcomePillColor, getOutcomeLabelKey } from './callTrackingTypes';
import { formatCurrency } from '../../utils/currency';
import { parseLocalDate } from '../../utils/timeFormatting';

interface Props {
  phone: string;
  onClose: () => void;
}

interface GuestProfile {
  phone: string;
  name: string | null;
  call_stats: {
    total_calls: number;
    successful_bookings: number;
    average_duration_seconds: number;
    sentiment: { positive: number; neutral: number; negative: number };
    first_call: string | null;
    last_call: string | null;
  };
  reservation_stats: {
    total_reservations: number;
    upcoming: number;
  };
  ltv: {
    total_visits: number;
    total_spend: number;
    average_spend: number;
    last_visit: string | null;
    churn_risk: number | null;
    tier: string | null;
    tags: string[] | null;
  } | null;
  recent_calls: Array<{
    id: string;
    date: string;
    duration: number | null;
    outcome: string;
    sentiment: string | null;
    summary: string | null;
  }>;
  recent_reservations: Array<{
    id: string;
    date: string;
    time: string;
    party_size: number;
    status: string;
    name: string | null;
  }>;
}

export default function GuestProfilePanel({ phone, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const { data: profile, isLoading, isError, refetch } = useQuery<GuestProfile | null>({
    queryKey: ['guest-profile', phone],
    queryFn: async () => {
      const res = await authFetch(`/api/guest-profile?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error('guest_profile_load_failed');
      const data = await res.json();
      if (!data.success) throw new Error('guest_profile_load_failed');
      return data.profile;
    },
    enabled: !!phone,
    staleTime: 60_000,
  });

  return (
    <div role="dialog" aria-modal="true" aria-label={t('callTracking.guestProfile')} className="fixed inset-y-0 right-0 w-full sm:w-96 sm:max-w-[90vw] bg-glass-modal backdrop-blur-glass-modal border-l border-glass-border-dark shadow-glass-modal z-40 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-glass-panel backdrop-blur-glass-nav border-b border-glass-border-dark p-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-deep-charcoal">
            {t('callTracking.guestProfile', 'Guest Profile')}
          </h3>
          <p className="text-xs text-muted-stone mt-0.5">{phone}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="p-1.5 hover:bg-deep-charcoal/[0.05] rounded-full transition-colors"
        >
          <ThiingsIcon name="close" size="xs" />
        </button>
      </div>

      {isLoading && (
        <div className="p-6 text-center text-sm text-muted-stone">
          {t('common.loading', 'Loading...')}
        </div>
      )}

      {isError && (
        <div className="p-6 text-center text-sm text-muted-stone">
          <p>{t('guestProfile.loadFailed')}</p>
          <button type="button" onClick={() => void refetch()} className="mt-3 rounded-full bg-burgundy px-4 py-2 text-sm text-white">
            {t('common.retry')}
          </button>
        </div>
      )}

      {!isLoading && !isError && !profile && (
        <div className="p-6 text-center text-sm text-muted-stone">
          {t('callTracking.noProfileData', 'No data found for this number.')}
        </div>
      )}

      {profile && (
        <div className="p-4 space-y-5">
          {/* Name + Tier */}
          <div className="text-center pb-4 border-b border-glass-border-dark">
            <p className="text-lg font-semibold text-deep-charcoal">
              {profile.name || t('callTracking.unknownCaller', 'Unknown Caller')}
            </p>
            {profile.ltv?.tier && (
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                profile.ltv.tier.toLowerCase() === 'at_risk' ? 'bg-amber-100 text-amber-700' :
                'bg-soft-gray text-deep-charcoal'
              }`}>
                {t(`crm.tier_${profile.ltv.tier.toLowerCase()}`, profile.ltv.tier)}
              </span>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatBox label={t('callTracking.totalCalls', 'Calls')} value={profile.call_stats.total_calls} />
            <StatBox label={t('callTracking.bookings', 'Bookings')} value={profile.call_stats.successful_bookings} />
            <StatBox label={t('callTracking.reservations', 'Reservations')} value={profile.reservation_stats.total_reservations} />
            <StatBox
              label={t('crm.avgSpend')}
              value={profile.ltv?.average_spend != null ? formatCurrency(Math.round(profile.ltv.average_spend)) : '—'}
            />
          </div>

          {/* Sentiment */}
          {profile.call_stats.total_calls > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-stone mb-2">
                {t('callTracking.sentiment', 'Sentiment')}
              </h4>
              <div className="flex gap-2">
                {(['positive', 'neutral', 'negative'] as const).map(s => (
                  <span key={s} className={`px-2 py-1 rounded-lg text-xs font-medium ${getSentimentColor(s)}`}>
                    {t(`guestProfile.sentiment_${s}`)}: {profile.call_stats.sentiment[s]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent Calls */}
          {profile.recent_calls.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-stone mb-2">
                {t('callTracking.recentCalls', 'Recent Calls')}
              </h4>
              <div className="space-y-2">
                {profile.recent_calls.map(call => (
                  <div key={call.id} className="border-b border-glass-border-dark py-2.5 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-stone">{new Date(call.date).toLocaleString(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getOutcomePillColor(call.outcome)}`}>
                        {t(getOutcomeLabelKey(call.outcome))}
                      </span>
                    </div>
                    {call.summary && (
                      <p className="text-xs text-muted-stone line-clamp-2">{call.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Reservations */}
          {profile.recent_reservations.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-stone mb-2">
                {t('callTracking.recentReservations', 'Recent Reservations')}
              </h4>
              <div className="space-y-2">
                {profile.recent_reservations.map(res => (
                  <div key={res.id} className="border-b border-glass-border-dark py-2.5 last:border-0 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-deep-charcoal">
                        {parseLocalDate(res.date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })} · {res.time}
                      </p>
                      <p className="text-[10px] text-muted-stone">
                        {t('guestProfile.people', { count: res.party_size })}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      res.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' :
                      res.status === 'no_show' ? 'bg-red-600/10 text-red-600' :
                      'bg-deep-charcoal/[0.06] text-muted-stone'
                    }`}>
                      {t(`crm.status${res.status === 'no_show' ? 'NoShow' : res.status.charAt(0).toUpperCase() + res.status.slice(1)}`, res.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Churn Risk */}
          {profile.ltv?.churn_risk != null && (
            <div>
              <h4 className="text-xs font-medium text-muted-stone mb-1">
                {t('crm.churnRisk')}
              </h4>
              <div className="w-full bg-deep-charcoal/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    profile.ltv.churn_risk > 70 ? 'bg-red-500' :
                    profile.ltv.churn_risk > 40 ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, profile.ltv.churn_risk))}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-stone mt-1">
                {Math.round(profile.ltv.churn_risk)}/100
              </p>
            </div>
          )}

          {/* Tags */}
          {profile.ltv?.tags && profile.ltv.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-stone mb-2">
                {t('callTracking.tags', 'Tags')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.ltv.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 glass-pill rounded-full text-[10px] font-medium text-muted-stone">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-b border-glass-border-dark py-3 text-center">
      <p className="text-lg font-semibold text-deep-charcoal">{value}</p>
      <p className="text-[10px] text-muted-stone mt-0.5">{label}</p>
    </div>
  );
}
