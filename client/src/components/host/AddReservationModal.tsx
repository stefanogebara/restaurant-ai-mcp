/**
 * AddReservationModal
 *
 * Host creates a new reservation from the dashboard.
 * Uses the existing /api/reservations?action=create endpoint
 * which handles ML scoring, SMS, WhatsApp, customer history, etc.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayLocalISO } from '../../utils/timeFormatting';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';
import PhoneInput from '../common/PhoneInput';

interface AddReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddReservationModal({ isOpen, onClose }: AddReservationModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Local timezone, NOT UTC — see todayLocalISO docs. A São Paulo host at
  // 23:00 local would otherwise get tomorrow's date here.
  const today = todayLocalISO();

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    date: today,
    time: '19:00',
    party_size: '2',
    special_requests: '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      hostAPI.createReservation({
        date: form.date,
        time: form.time,
        party_size: parseInt(form.party_size, 10),
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        customer_email: form.customer_email.trim() || undefined,
        special_requests: form.special_requests.trim() || undefined,
        source: 'dashboard',
      }),
    onSuccess: () => {
      toast.success(t('reservations.addSuccess', 'Reservation created successfully'));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      handleClose();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t('reservations.addFailed', 'Failed to create reservation');
      toast.error(message);
    },
  });

  const handleClose = () => {
    setForm({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      date: today,
      time: '19:00',
      party_size: '2',
      special_requests: '',
    });
    onClose();
  };

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
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reservations.addTitle', 'Add Reservation')}
        className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-deep-charcoal">
            {t('reservations.addTitle', 'Add Reservation')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
          >
            <ThiingsIcon name="close" pxSize={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('reservations.customerName', 'Guest Name')} *
            </label>
            <input
              type="text"
              required
              value={form.customer_name}
              onChange={(e) => update('customer_name', e.target.value)}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
              placeholder={t('placeholders.name', 'John Smith')}
            />
          </div>

          {/* Phone */}
          <PhoneInput
            value={form.customer_phone}
            onChange={(fullNumber) => update('customer_phone', fullNumber)}
            label={t('reservations.customerPhone', 'Phone')}
            required
          />

          {/* Email (optional) */}
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('reservations.customerEmail', 'Email')}
            </label>
            <input
              type="email"
              value={form.customer_email}
              onChange={(e) => update('customer_email', e.target.value)}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
              placeholder={t('placeholders.email', 'john@example.com')}
            />
          </div>

          {/* Date + Time row */}
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
              placeholder={t('reservations.specialRequestsPlaceholder', 'Birthday celebration, high chair needed...')}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
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
                ? t('reservations.creating', 'Creating...')
                : t('reservations.create', 'Create Reservation')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
