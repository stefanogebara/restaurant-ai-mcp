import { useTranslation } from 'react-i18next';
import { useEventBookings, useRefundEventBooking } from '../../hooks/useEvents';
import type { EventBooking } from '../../hooks/useEvents';

function formatPrice(price: number): string {
  return `R$ ${Number(price).toFixed(2)}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPaymentBadge(status: string, t: (key: string, fallback: string) => string) {
  switch (status) {
    case 'paid':
      return { label: t('eventBookings.statusPaid', 'Paid'), color: 'bg-green-50 text-green-700' };
    case 'refunded':
      return { label: t('eventBookings.statusRefunded', 'Refunded'), color: 'bg-amber-50 text-amber-700' };
    case 'failed':
      return { label: t('eventBookings.statusFailed', 'Failed'), color: 'bg-red-50 text-red-700' };
    case 'pending':
    default:
      return { label: t('eventBookings.statusPending', 'Pending'), color: 'bg-gray-100 text-gray-600' };
  }
}

function BookingRow({ booking }: { booking: EventBooking }) {
  const { t } = useTranslation();
  const refundMutation = useRefundEventBooking();
  const badge = getPaymentBadge(booking.payment_status, t);

  const handleRefund = () => {
    if (window.confirm(t('eventBookings.confirmRefund', 'Refund this booking? This cannot be undone.'))) {
      refundMutation.mutate(booking.id);
    }
  };

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-glass-border-dark last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-deep-charcoal truncate">{booking.customer_name}</p>
          <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-stone-gray mt-0.5">
          <span>{booking.customer_email}</span>
          <span>{booking.party_size} {t('eventBookings.guests', 'guests')}</span>
          <span>{formatPrice(booking.total_amount)}</span>
        </div>
        {booking.special_requests && (
          <p className="text-xs text-stone-gray/80 mt-0.5 italic truncate">{booking.special_requests}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <span className="text-xs text-stone-gray">{formatDateTime(booking.created_at)}</span>
        {booking.payment_status === 'paid' && booking.booking_status === 'confirmed' && (
          <button
            type="button"
            onClick={handleRefund}
            disabled={refundMutation.isPending}
            className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            {t('eventBookings.refund', 'Refund')}
          </button>
        )}
      </div>
    </div>
  );
}

interface EventBookingsPanelProps {
  eventId: string;
}

export default function EventBookingsPanel({ eventId }: EventBookingsPanelProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useEventBookings(eventId);

  if (isLoading) {
    return (
      <div className="py-4 flex justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-glass-border-dark border-t-[#9F1239]" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-600 py-2">{t('eventBookings.error', 'Failed to load bookings')}</p>;
  }

  const bookings = data?.bookings || [];
  const summary = data?.summary;

  return (
    <div className="mt-3 border-t border-glass-border-dark pt-3">
      {/* Revenue summary */}
      {summary && summary.total_bookings > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <p className="text-sm font-bold text-deep-charcoal">{summary.paid_bookings}</p>
            <p className="text-[10px] text-stone-gray">{t('eventBookings.paidBookings', 'Paid')}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-green-700">{formatPrice(summary.net_revenue)}</p>
            <p className="text-[10px] text-stone-gray">{t('eventBookings.netRevenue', 'Net Revenue')}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-amber-600">{formatPrice(summary.total_refunded)}</p>
            <p className="text-[10px] text-stone-gray">{t('eventBookings.refunded', 'Refunded')}</p>
          </div>
        </div>
      )}

      {/* Booking list */}
      {bookings.length === 0 ? (
        <p className="text-xs text-stone-gray text-center py-3">
          {t('eventBookings.noBookings', 'No bookings yet')}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {bookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}
