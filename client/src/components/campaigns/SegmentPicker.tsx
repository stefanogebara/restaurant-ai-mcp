import { useTranslation } from 'react-i18next';
import { useSegmentCounts } from '../../hooks/useCampaigns';
import type { SegmentCounts } from '../../hooks/useCampaigns';
import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';

interface SegmentPickerProps {
  value: string;
  onChange: (segment: string) => void;
}

interface SegmentCard {
  key: keyof SegmentCounts;
  labelKey: string;
  descKey: string;
  icon: IconName;
}

const SEGMENTS: SegmentCard[] = [
  { key: 'all', labelKey: 'campaigns.segmentAll', descKey: 'campaigns.segmentAllDesc', icon: 'users' },
  { key: 'vip', labelKey: 'campaigns.segmentVip', descKey: 'campaigns.segmentVipDesc', icon: 'crown' },
  { key: 'at_risk', labelKey: 'campaigns.segmentAtRisk', descKey: 'campaigns.segmentAtRiskDesc', icon: 'alert-triangle' },
  { key: 'inactive_30d', labelKey: 'campaigns.segmentInactive', descKey: 'campaigns.segmentInactiveDesc', icon: 'clock' },
  { key: 'birthday_this_month', labelKey: 'campaigns.segmentBirthday', descKey: 'campaigns.segmentBirthdayDesc', icon: 'gift' },
  { key: 'new_customers', labelKey: 'campaigns.segmentNew', descKey: 'campaigns.segmentNewDesc', icon: 'star' },
];

export default function SegmentPicker({ value, onChange }: SegmentPickerProps) {
  const { t } = useTranslation();
  const { data: counts, isLoading } = useSegmentCounts();

  return (
    <div>
      <label className="block text-sm font-medium text-deep-charcoal mb-2">
        {t('campaigns.targetAudience')}
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SEGMENTS.map((seg) => {
          const isSelected = value === seg.key;
          const count = counts?.[seg.key] ?? 0;

          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => onChange(seg.key)}
              className={`
                relative flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors
                ${isSelected
                  ? 'border-burgundy bg-burgundy/5'
                  : 'border-glass-border-dark bg-white/60 backdrop-blur-glass-chip hover:bg-white/85 hover:border-burgundy/40'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <ThiingsIcon
                  name={seg.icon}
                  size="xs"
                  className={isSelected ? 'text-burgundy' : 'text-stone-gray'}
                />
                <span className="text-sm font-medium text-deep-charcoal">
                  {t(seg.labelKey)}
                </span>
              </div>
              <p className="text-xs text-stone-gray leading-snug">
                {t(seg.descKey)}
              </p>
              <span className="text-xs font-medium text-deep-charcoal mt-1">
                {isLoading ? '...' : `${count} ${t('campaigns.customers')}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
