import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useMutation } from '@tanstack/react-query';
import ThiingsIcon from '../common/ThiingsIcon';
import { getTags } from './waitlistHelpers';

interface AddToWaitlistModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const TAG_PRESETS = ['High Chair', 'Outdoor', 'Birthday', 'Anniversary', 'Wheelchair', 'VIP', 'Window', 'Quiet'];

export default function AddToWaitlistModal({ onClose, onSuccess }: AddToWaitlistModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    party_size: '2',
    special_requests: '',
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await authFetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          party_size: parseInt(data.party_size),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add to waitlist');
      }
      return response.json();
    },
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate(formData);
  };

  const addTag = (tag: string) => {
    const current = formData.special_requests;
    const tags = current ? current.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!tags.includes(tag)) {
      const newValue = current ? `${current}, ${tag}` : tag;
      setFormData({ ...formData, special_requests: newValue });
    }
  };

  const currentTags = getTags(formData.special_requests);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-border-gray max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-deep-charcoal">{t('waitlist.addToWaitlist')}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
            >
              <ThiingsIcon name="close" pxSize={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-2">
                {t('waitlist.customerName')} *
              </label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
                placeholder={t('placeholders.name', 'John Smith')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-2">
                {t('waitlist.phoneNumber')} *
              </label>
              <input
                type="tel"
                required
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
                placeholder={t('placeholders.phone', '+1 234 567 8900')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-2">
                {t('waitlist.emailOptional')}
              </label>
              <input
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
                placeholder={t('placeholders.email', 'john@example.com')}
              />
            </div>

            <div>
              <label htmlFor="waitlist-party-size" className="block text-sm font-medium text-deep-charcoal mb-2">
                {t('waitlist.partySize')} *
              </label>
              <select
                id="waitlist-party-size"
                required
                value={formData.party_size}
                onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(size => (
                  <option key={size} value={size}>{size} {size === 1 ? 'guest' : 'guests'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-deep-charcoal mb-2">
                {t('waitlist.specialRequests')}
              </label>

              {/* Tag Presets */}
              <div className="flex flex-wrap gap-2 mb-3">
                {TAG_PRESETS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    disabled={currentTags.includes(tag)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      currentTags.includes(tag)
                        ? 'bg-violet-600/20 text-violet-600 cursor-not-allowed'
                        : 'bg-soft-gray hover:bg-border-gray text-stone-gray'
                    }`}
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              {/* Selected Tags Display */}
              {currentTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {currentTags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-violet-600/10 text-violet-600 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <textarea
                value={formData.special_requests}
                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all resize-none"
                rows={2}
                placeholder={t('placeholders.tags', 'Add comma-separated tags or notes...')}
              />
            </div>

            {addMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-500">
                {(addMutation.error as Error).message}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-all font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-all shadow-lg shadow-burgundy/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addMutation.isPending ? t('waitlist.adding') : t('waitlist.addToWaitlist')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
