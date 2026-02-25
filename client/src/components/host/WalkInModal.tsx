import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Table, SeatModalData } from '../../types/host.types';
import TableCombinationSelector from './TableCombinationSelector';
import ThiingsIcon from '../common/ThiingsIcon';

interface WalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: SeatModalData) => void;
  availableTables: Table[];
}

export default function WalkInModal({ isOpen, onClose, onSuccess, availableTables }: WalkInModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState({
    party_size: '',
    customer_name: '',
    customer_phone: '',
    preferred_location: '',
  });
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectedTableNumbers, setSelectedTableNumbers] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2); // Move to table selection step
  };

  const handleTableSelect = (tableIds: string[], tableNumbers: string[]) => {
    setSelectedTableIds(tableIds);
    setSelectedTableNumbers(tableNumbers);
  };

  const handleProceedToSeat = () => {
    onSuccess({
      type: 'walk-in',
      customer_name: formData.customer_name,
      customer_phone: formData.customer_phone,
      party_size: parseInt(formData.party_size),
      table_ids: selectedTableIds,
      table_numbers: selectedTableNumbers, // For display purposes
      special_requests: '',
    });
  };

  const handleBack = () => {
    setStep(1);
    setSelectedTableIds([]);
    setSelectedTableNumbers([]);
  };

  const handleClose = () => {
    setStep(1);
    setFormData({ party_size: '', customer_name: '', customer_phone: '', preferred_location: '' });
    setSelectedTableIds([]);
    setSelectedTableNumbers([]);
    onClose();
  };

  if (!isOpen) return null;

  // Derive unique locations from available tables
  const locations = [...new Set(availableTables.map(t => t.location).filter(Boolean))].sort();

  // Filter tables by preferred location if specified
  const filteredTables = formData.preferred_location
    ? availableTables.filter(t => t.location === formData.preferred_location)
    : availableTables;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Walk-in seating" className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-deep-charcoal">
            {step === 1 ? t('dashboard.walkIn.addCustomer') : t('dashboard.walkIn.selectTable')}
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

        {/* Step 1: Customer Information */}
        {step === 1 && (
          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('dashboard.walkIn.partySize')} *
            </label>
            <input
              type="number"
              min="1"
              max="20"
              required
              aria-label="Party size"
              value={formData.party_size}
              onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('dashboard.walkIn.customerName')} *
            </label>
            <input
              type="text"
              required
              aria-label="Customer name"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('dashboard.walkIn.customerPhone')} *
            </label>
            <input
              type="tel"
              required
              aria-label="Customer phone"
              placeholder="+1 (555) 123-4567"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
            />
            <p className="text-xs text-muted-stone mt-1">{t('dashboard.walkIn.phoneFormatHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('dashboard.walkIn.preferredLocation')}
            </label>
            <select
              aria-label="Preferred location"
              value={formData.preferred_location}
              onChange={(e) => setFormData({ ...formData, preferred_location: e.target.value })}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
            >
              <option value="">{t('dashboard.walkIn.noPreference')}</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-burgundy text-white font-medium rounded-xl hover:bg-burgundy-dark transition-colors"
              >
                {t('dashboard.walkIn.nextSelectTable')}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Table Selection */}
        {step === 2 && (
          <>
            {/* Customer Info Summary */}
            <div className="bg-soft-gray rounded-xl p-4 mb-4 border border-border-gray">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-stone-gray">{t('dashboard.walkIn.customer')}</div>
                  <div className="font-semibold text-deep-charcoal">{formData.customer_name}</div>
                </div>
                <div>
                  <div className="text-sm text-stone-gray">{t('dashboard.walkIn.partySize')}</div>
                  <div className="font-semibold text-deep-charcoal">{formData.party_size} guests</div>
                </div>
              </div>
            </div>

            {/* Table Combination Selector */}
            <TableCombinationSelector
              availableTables={filteredTables}
              partySize={parseInt(formData.party_size)}
              onSelect={handleTableSelect}
              selectedTableIds={selectedTableIds}
            />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                onClick={handleProceedToSeat}
                className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:bg-muted-stone disabled:cursor-not-allowed transition-colors"
                disabled={selectedTableIds.length === 0}
              >
                {t('dashboard.walkIn.proceedToSeat')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
