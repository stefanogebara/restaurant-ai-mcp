import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import WaitlistTimeDisplay from './WaitlistTimeDisplay';
import { getTags, getStatusColor, isStaleNotified, formatNotifiedTime } from './waitlistHelpers';
import type { WaitlistEntry } from './waitlistHelpers';

interface WaitlistEntryCardProps {
  entry: WaitlistEntry;
  isTableReady?: boolean;
  onNotify: (id: string) => void;
  onRemove: (id: string) => void;
  onSeatNow: (entry: WaitlistEntry) => void;
  isNotifying: boolean;
  isRemoving: boolean;
  showActions?: boolean;
  timeZone?: string;
}

export default function WaitlistEntryCard({
  entry,
  isTableReady,
  onNotify,
  onRemove,
  onSeatNow,
  isNotifying,
  isRemoving,
  showActions = true,
  timeZone,
}: WaitlistEntryCardProps) {
  const { t, i18n } = useTranslation();
  const needsReview = isStaleNotified(entry);
  const initials = entry.customer_name
    ? entry.customer_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const tags = getTags(entry.special_requests);

  return (
    <div className={`px-3 py-4 border-b border-glass-border-dark/50 hover:bg-warm-white transition-colors ${
      needsReview ? 'bg-amber-50/40' : isTableReady ? 'bg-emerald-50/40' : ''
    }`}>
      {/* Row 1: Avatar, Name, Party Size, Status */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-soft-gray flex items-center justify-center font-semibold text-xs text-deep-charcoal border border-glass-border-dark flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-deep-charcoal text-sm truncate">{entry.customer_name || t('waitlist.guestFallback', 'Guest')}</span>
            {(entry.source === 'whatsapp' || entry.source === 'whatsapp_ai') && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full flex-shrink-0"
                title="WhatsApp"
                aria-label="WhatsApp"
              >
                <ThiingsIcon name="chat" pxSize={11} />
                WhatsApp
              </span>
            )}
            <span className="px-1.5 py-0.5 bg-soft-gray rounded-lg text-[10px] font-medium text-stone-gray flex-shrink-0">
              {t('waitlist.partyCount', '{{count}}p', { count: entry.party_size })}
            </span>
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-lg ${getStatusColor(entry.status)} flex-shrink-0`}>
              {t(`waitlist.status.${entry.status.toLowerCase()}`, entry.status)}
            </span>
          </div>
          <div className="text-[11px] text-stone-gray">{entry.customer_phone}</div>
        </div>
      </div>

      {/* Row 2: Time Display with Progress (compact) */}
      {['Waiting', 'Notified'].includes(entry.status) && entry.added_at && entry.estimated_wait && (
        <div className="mt-1.5 ml-10">
          <WaitlistTimeDisplay addedAt={entry.added_at} estimatedWait={entry.estimated_wait} compact />
        </div>
      )}

      {/* Row 3: Tags (compact) */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 ml-10">
          {tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="px-1.5 py-0.5 text-[10px] bg-ocre-600/10 text-ocre-600 rounded-lg">
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-border-gray text-stone-gray rounded-lg">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Notified timestamp */}
      {entry.status === 'notified' && entry.notified_at && (
        <div className="text-[10px] text-amber-600 ml-10 mt-1">
          {t('waitlist.notifiedAt', 'Notified')} {formatNotifiedTime(entry.notified_at, i18n.language, new Date(), timeZone)}
          {needsReview && <span className="ml-1 font-medium">· {t('waitlist.reviewOldNotice')}</span>}
        </div>
      )}

      {/* Row 4: Action Buttons (compact) */}
      {showActions && (
        <div className="flex items-center gap-1.5 mt-2 ml-10">
          {entry.status === 'waiting' && (
            <>
              <button
                onClick={() => onNotify(entry.id)}
                disabled={isNotifying}
                className="px-2 py-1 text-[11px] bg-burgundy hover:bg-burgundy/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {t('waitlist.ready')}
              </button>
              <button
                onClick={() => onSeatNow(entry)}
                className="px-2 py-1 text-[11px] bg-burgundy hover:bg-burgundy/90 text-white font-medium rounded-lg transition-colors"
              >
                {t('waitlist.seat')}
              </button>
            </>
          )}
          {entry.status === 'notified' && (
            <button
              onClick={() => onSeatNow(entry)}
              className="px-2 py-1 text-[11px] bg-burgundy hover:bg-burgundy/90 text-white font-medium rounded-lg transition-colors"
            >
              {t('waitlist.seatNow')}
            </button>
          )}
          <button
            onClick={() => onRemove(entry.id)}
            disabled={isRemoving}
            className="px-2 py-1 text-[11px] bg-soft-gray hover:bg-border-gray text-stone-gray rounded-lg transition-colors disabled:opacity-50 ml-auto"
          >
            {t('waitlist.remove')}
          </button>
        </div>
      )}
    </div>
  );
}
