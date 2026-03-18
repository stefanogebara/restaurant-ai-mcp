import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { colors } from '../../utils/colors';
import { getTierBadge } from './customerProfileHelpers';
import type { FullProfile } from './customerProfile.types';

interface CustomerProfileHeaderProps {
  data: FullProfile;
}

export default function CustomerProfileHeader({ data }: CustomerProfileHeaderProps) {
  const { t } = useTranslation();
  const profile = data.profile;
  const textSignals = data.text_signals;
  const displayName = data.customer_name || data.customer_id;
  const tier = getTierBadge(profile?.profile_confidence || 0);

  return (
    <div className="bg-white rounded-2xl border border-border-gray p-6 shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-violet-600/10 flex items-center justify-center">
            <ThiingsIcon name="user" pxSize={32} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-serif text-deep-charcoal">{displayName}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tier.color}`}>{tier.label}</span>
              {textSignals?.vip_signals && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-600/20 text-amber-600">
                  <ThiingsIcon name="star" pxSize={12} className="inline mr-1" />{t('host.customerProfile.vipSignals', 'VIP Signals')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-stone-gray">
              <span className="flex items-center gap-1"><ThiingsIcon name="phone" pxSize={12} />{data.customer_id}</span>
              <span className="flex items-center gap-1"><ThiingsIcon name="calendar" pxSize={12} />{data.reservations.length} {t('host.customerProfile.visits', 'visits')}</span>
              {profile?.last_analyzed_at && (
                <span className="flex items-center gap-1">
                  <ThiingsIcon name="clock" pxSize={12} />
                  {t('host.customerProfile.analyzed', 'Analyzed')} {new Date(profile.last_analyzed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Confidence Meter */}
        <div className="text-center">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={colors.borderGray} strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray={`${profile?.profile_confidence || 0}, 100`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-deep-charcoal">
              {profile?.profile_confidence || 0}%
            </span>
          </div>
          <div className="text-xs text-stone-gray mt-1">{t('host.customerProfile.confidence', 'Confidence')}</div>
        </div>
      </div>

      {profile?.data_sources_used && profile.data_sources_used.length > 0 && (
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-gray">{t('host.customerProfile.dataSources', 'Data sources:')}</span>
          {profile.data_sources_used.map((src) => (
            <span key={src} className="px-2 py-0.5 bg-soft-gray rounded-full text-xs text-stone-gray">{src.replace('_', ' ')}</span>
          ))}
          {profile.analysis_version && (
            <span className="px-2 py-0.5 bg-violet-600/10 rounded-full text-xs text-violet-600">{profile.analysis_version}</span>
          )}
        </div>
      )}
    </div>
  );
}
