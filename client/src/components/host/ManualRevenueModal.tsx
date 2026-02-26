/**
 * Manual Revenue Entry Modal
 *
 * Allows staff to manually enter revenue data for customers
 * when POS integration is not available.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import { getManualRevenueTranslations } from './manualRevenueTranslations';
import { useCustomerSearch } from '../../hooks/useCustomerSearch';
import type { Customer } from '../../hooks/useCustomerSearch';

interface ManualRevenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  language?: 'en' | 'es';
}

export default function ManualRevenueModal({
  isOpen,
  onClose,
  onSuccess,
  language = 'en'
}: ManualRevenueModalProps) {
  const [error, setError] = useState<string | null>(null);

  const createRevenue = useMutation({
    mutationFn: async (body: {
      customer_phone?: string;
      customer_name?: string;
      customer_email?: string;
      total_revenue: number;
      tip_amount: number;
      party_size: number;
      service_date: string;
      service_time?: string;
      notes?: string;
    }) => {
      const response = await authFetch('/api/revenue?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t.errorSave);
      return data;
    },
    onSuccess: () => { resetForm(); onSuccess?.(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : t.errorSave),
  });

  // Form fields
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [serviceTime, setServiceTime] = useState('');
  const [notes, setNotes] = useState('');

  const t = getManualRevenueTranslations(language);
  const { searchQuery, setSearchQuery, searchResults, isSearching, clearSearch } = useCustomerSearch();

  const selectCustomer = (customer: Customer) => {
    setCustomerPhone(customer.customer_phone || '');
    setCustomerName(customer.customer_name || '');
    setCustomerEmail(customer.customer_email || '');
    clearSearch();
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if ((!customerPhone && !customerEmail) || !totalRevenue) {
      setError(t.errorRequired);
      return;
    }

    createRevenue.mutate({
      customer_phone: customerPhone || undefined,
      customer_name: customerName || undefined,
      customer_email: customerEmail || undefined,
      total_revenue: parseFloat(totalRevenue),
      tip_amount: tipAmount ? parseFloat(tipAmount) : 0,
      party_size: parseInt(partySize),
      service_date: serviceDate,
      service_time: serviceTime || undefined,
      notes: notes || undefined,
    });
  };

  const resetForm = () => {
    setCustomerPhone('');
    setCustomerName('');
    setCustomerEmail('');
    setTotalRevenue('');
    setTipAmount('');
    setPartySize('2');
    setServiceDate(new Date().toISOString().split('T')[0]);
    setServiceTime('');
    setNotes('');
    clearSearch();
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div role="dialog" aria-modal="true" aria-label="Log Revenue" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-border-gray flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-600/10 rounded-xl">
              <ThiingsIcon name="dollar" size="sm" />
            </div>
            <h2 className="text-xl font-bold text-deep-charcoal">{t.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-soft-gray rounded-xl transition-colors"
          >
            <ThiingsIcon name="x-circle" size="sm" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t.customerSearch}
            </label>
            <div className="relative">
              <ThiingsIcon name="search" size="xs" className="absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
              />
              {isSearching && (
                <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-border-gray rounded-2xl shadow-lg max-h-40 overflow-y-auto">
                {searchResults.map((customer) => (
                  <button
                    key={customer.customer_id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="w-full px-4 py-2 text-left hover:bg-soft-gray transition-colors flex items-center gap-3"
                  >
                    <ThiingsIcon name="user" size="xs" />
                    <div>
                      <div className="font-medium text-deep-charcoal">
                        {customer.customer_name || customer.customer_phone || customer.customer_email}
                      </div>
                      {customer.customer_phone && (
                        <div className="text-xs text-stone-gray">{customer.customer_phone}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                <ThiingsIcon name="phone" size="xs" className="inline mr-1" />
                {t.customerPhone}
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+34 612 345 678"
                className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                <ThiingsIcon name="user" size="xs" className="inline mr-1" />
                {t.customerName}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Maria Garcia"
                className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t.customerEmail}
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="maria@example.com"
              className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
            />
          </div>

          {/* Revenue & Tip */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                <ThiingsIcon name="dollar" size="xs" className="inline mr-1" />
                {t.totalRevenue} *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-gray">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalRevenue}
                  onChange={(e) => setTotalRevenue(e.target.value)}
                  placeholder="85.50"
                  required
                  className="w-full pl-8 pr-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                {t.tipAmount}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-gray">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="10.00"
                  className="w-full pl-8 pr-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Date, Time, Party Size */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                <ThiingsIcon name="calendar" size="xs" className="inline mr-1" />
                {t.serviceDate} *
              </label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-1">
                {t.serviceTime}
              </label>
              <input
                type="time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
                className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
              />
            </div>
            <div>
              <label htmlFor="manual-revenue-party-size" className="block text-sm font-medium text-deep-charcoal mb-1">
                <ThiingsIcon name="users" size="xs" className="inline mr-1" />
                {t.partySize}
              </label>
              <select
                id="manual-revenue-party-size"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anniversary dinner, special menu..."
              rows={2}
              className="w-full px-4 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={createRevenue.isPending}
              className="flex-1 px-4 py-3 border border-border-gray rounded-xl text-stone-gray font-medium hover:bg-soft-gray transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={createRevenue.isPending}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createRevenue.isPending ? (
                <>
                  <Spinner size="sm" />
                  {t.saving}
                </>
              ) : (
                <>
                  <ThiingsIcon name="dollar" size="xs" />
                  {t.save}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
