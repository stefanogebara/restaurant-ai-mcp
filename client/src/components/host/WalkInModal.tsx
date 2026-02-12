import { useState } from 'react';
import type { Table } from '../../types/host.types';
import TableCombinationSelector from './TableCombinationSelector';

interface WalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
  availableTables: Table[];
}

export default function WalkInModal({ isOpen, onClose, onSuccess, availableTables }: WalkInModalProps) {
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

  // Filter tables by preferred location if specified
  const filteredTables = formData.preferred_location
    ? availableTables.filter(t => t.location === formData.preferred_location)
    : availableTables;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E7E5E4] p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-[#1C1917] mb-4">
          {step === 1 ? 'Add Walk-in Customer' : 'Select Table'}
        </h2>

        {/* Step 1: Customer Information */}
        {step === 1 && (
          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              Party Size *
            </label>
            <input
              type="number"
              min="1"
              max="20"
              required
              aria-label="Party size"
              value={formData.party_size}
              onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
              className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              required
              aria-label="Customer name"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              Customer Phone *
            </label>
            <input
              type="tel"
              required
              aria-label="Customer phone"
              placeholder="+1 (555) 123-4567"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
            />
            <p className="text-xs text-[#A8A29E] mt-1">Any format accepted, e.g. +1 (555) 123-4567</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              Preferred Location (Optional)
            </label>
            <select
              aria-label="Preferred location"
              value={formData.preferred_location}
              onChange={(e) => setFormData({ ...formData, preferred_location: e.target.value })}
              className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
            >
              <option value="">No preference</option>
              <option value="Main Room">Main Room</option>
              <option value="Patio">Patio</option>
              <option value="Bar Area">Bar Area</option>
              <option value="Private Room">Private Room</option>
            </select>
          </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-3 border border-[#E7E5E4] text-[#57534E] font-medium rounded-xl hover:bg-[#F5F5F4] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-[#9F1239] text-white font-medium rounded-xl hover:bg-[#881337] transition-colors"
              >
                Next: Select Table
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Table Selection */}
        {step === 2 && (
          <>
            {/* Customer Info Summary */}
            <div className="bg-[#F5F5F4] rounded-xl p-4 mb-4 border border-[#E7E5E4]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-[#57534E]">Customer</div>
                  <div className="font-semibold text-[#1C1917]">{formData.customer_name}</div>
                </div>
                <div>
                  <div className="text-sm text-[#57534E]">Party Size</div>
                  <div className="font-semibold text-[#1C1917]">{formData.party_size} guests</div>
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
                onClick={handleBack}
                className="flex-1 px-4 py-3 border border-[#E7E5E4] text-[#57534E] font-medium rounded-xl hover:bg-[#F5F5F4] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleProceedToSeat}
                className="flex-1 px-4 py-3 bg-[#16a34a] text-white font-medium rounded-xl hover:bg-[#15803d] disabled:bg-[#A8A29E] disabled:cursor-not-allowed transition-colors"
                disabled={selectedTableIds.length === 0}
              >
                Proceed to Seat
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
