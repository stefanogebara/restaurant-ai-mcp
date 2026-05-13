/**
 * EditReservationModal
 *
 * Host edits an existing reservation's date, time, party size, or special requests.
 * Uses the existing /api/reservations?action=modify endpoint.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { todayLocalISO } from '../../utils/timeFormatting';
import type { UpcomingReservation } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';

interface EditReservationModalProps {
  isOpen: boolean;
  reservation: UpcomingReservation;
  onClose: () => void;
}

export default function EditReservationModal({ isOpen, reservation, onClose }: EditReservationModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Local timezone, NOT UTC — see todayLocalISO docs.
  const today = todayLocalISO();

  const [form, setForm] = useState({
    date: reservation.date,
    time: reservation.time,
    party_size: String(reservation.party_size),
    special_requests: reservation.special_requests || '',
  });

  const mutation = useMutation({
    mutationFn: () => {
      const changes: Record<string, string | number> = {
        reservation_id: reservation.reservation_id,
      };
      if (form.date !== reservation.date) changes.date = form.date;
      if (form.time !== reservation.time) changes.time = form.time;
      if (parseInt(form.party_size, 10) !== reservation.party_size) changes.party_size = parseInt(form.party_size, 10);
      if (form.special_requests !== (reservation.special_requests || '')) changes.special_requests = form.special_requests;

      return hostAPI.modifyReservation(changes as Parameters<typeof hostAPI.modifyReservation>[0]);
    },
    onSuccess: () => {
      toast.success(t('reservations.editSuccess', 'Reservation updated'));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      onClose();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t('reservations.editFailed', 'Failed to update reservation');
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reservations.editTitle', 'Edit Reservation')}
        className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-deep-charcoal">
            {t('reservations.editTitle', 'Edit Reservation')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
          >
            <ThiingsIcon name="close" pxSize={16} />
          </button>
        </div>

        {/* Guest info (read-only) */}
        <div className="bg-soft-gray rounded-xl p-4 mb-5 border border-border-gray">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-stone">{t('reservations.customerName', 'Guest')}</div>
              <div className="text-sm font-semibold text-deep-charcoal">{reservation.customer_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-stone">{t('reservations.confirmationId', 'Confirmation')}</div>
              <div className="text-sm font-mono font-semibold text-burgundy">{reservation.reservation_id}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                {t('reservations.date', 'Date')} *
              </label>
              <input
                type="date"
                required
                min={today}
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                {t('reservations.time', 'Time')} *
              </label>
              <input
                type="time"
                required
                value={form.time}
                onChange={(e) => update('time', e.target.value)}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
              />
            </div>
          </div>

          {/* Party Size */}
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('reservations.partySize', 'Party Size')} *
            </label>
            <input
              type="number"
              required
              min="1"
              max="20"
              value={form.party_size}
              onChange={(e) => update('party_size', e.target.value)}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
            />
          </div>

          {/* Special Requests */}
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('reservations.specialRequests', 'Special Requests')}
            </label>
            <textarea
              rows={2}
              value={form.special_requests}
              onChange={(e) => update('special_requests', e.target.value)}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-3 bg-burgundy text-white font-semibold rounded-xl hover:bg-burgundy-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending
                ? t('reservations.saving', 'Saving...')
                : t('reservations.saveChanges', 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
