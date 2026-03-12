/**
 * CancelReservationDialog
 *
 * Compact confirmation dialog with optional reason.
 * Sends cancellation email to customer if they have an email on file.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import type { UpcomingReservation } from '../../types/host.types';

interface CancelReservationDialogProps {
  isOpen: boolean;
  reservation: UpcomingReservation;
  onClose: () => void;
}

const CANCEL_REASONS = [
  { value: '', labelKey: 'reservations.cancelReasonNone' as const, fallback: 'Select a reason (optional)' },
  { value: 'customer_request', labelKey: 'reservations.cancelReasonCustomer' as const, fallback: 'Customer requested' },
  { value: 'no_show', labelKey: 'reservations.cancelReasonNoShow' as const, fallback: 'No-show' },
  { value: 'duplicate', labelKey: 'reservations.cancelReasonDuplicate' as const, fallback: 'Duplicate booking' },
  { value: 'restaurant_closed', labelKey: 'reservations.cancelReasonClosed' as const, fallback: 'Restaurant closed' },
  { value: 'capacity_issue', labelKey: 'reservations.cancelReasonCapacity' as const, fallback: 'Capacity issue' },
  { value: 'other', labelKey: 'reservations.cancelReasonOther' as const, fallback: 'Other' },
];

export default function CancelReservationDialog({ isOpen, reservation, onClose }: CancelReservationDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      hostAPI.cancelReservation({
        reservation_id: reservation.reservation_id,
        reason: reason || undefined,
      }),
    onSuccess: (res) => {
      const notified = res.data?.notification_sent;
      const msg = notified
        ? t('reservations.cancelledWithNotification', 'Reservation cancelled. Customer notified by email.')
        : t('reservations.cancelledNoNotification', 'Reservation cancelled.');
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      handleClose();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t('reservations.cancelFailed', 'Failed to cancel');
      toast.error(message);
    },
  });

  const handleClose = () => {
    setReason('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reservations.cancelTitle', 'Cancel Reservation')}
        className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-sm w-full mx-4"
      >
        <h3 className="text-lg font-bold text-deep-charcoal mb-2">
          {t('reservations.cancelTitle', 'Cancel Reservation')}
        </h3>

        <p className="text-sm text-stone-gray mb-1">
          {t('reservations.cancelConfirm', 'Are you sure you want to cancel this reservation?')}
        </p>

        {/* Reservation summary */}
        <div className="bg-soft-gray rounded-lg px-3 py-2 mb-4 text-sm">
          <span className="font-semibold text-deep-charcoal">{reservation.customer_name}</span>
          <span className="text-muted-stone"> — {reservation.party_size}p, {reservation.date} {reservation.time}</span>
        </div>

        {/* Reason dropdown */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-stone mb-1">
            {t('reservations.cancelReason', 'Reason')}
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-lg text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          >
            {CANCEL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.labelKey, r.fallback)}
              </option>
            ))}
          </select>
        </div>

        {/* Customer notification hint */}
        {reservation.customer_email && (
          <p className="text-xs text-muted-stone mb-4">
            {t('reservations.cancelEmailHint', 'The customer will be notified by email.')}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
          >
            {t('common.back', 'Back')}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending
              ? t('reservations.cancelling', 'Cancelling...')
              : t('reservations.confirmCancel', 'Cancel Reservation')}
          </button>
        </div>
      </div>
    </div>
  );
}
