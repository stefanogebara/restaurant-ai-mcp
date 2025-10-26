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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2); // Move to table selection step
  };

  const handleProceedToSeat = () => {
    onSuccess({
      type: 'walk-in',
      customer_name: formData.customer_name,
      customer_phone: formData.customer_phone,
      party_size: parseInt(formData.party_size),
      table_ids: selectedTableIds,
      special_requests: '',
    });
  };

  const handleBack = () => {
    setStep(1);
    setSelectedTableIds([]);
  };

  const handleClose = () => {
    setStep(1);
    setFormData({ party_size: '', customer_name: '', customer_phone: '', preferred_location: '' });
    setSelectedTableIds([]);
    onClose();
  };

  if (!isOpen) return null;

  // Filter tables by preferred location if specified
  const filteredTables = formData.preferred_location
    ? availableTables.filter(t => t.location === formData.preferred_location)
    : availableTables;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {step === 1 ? 'Add Walk-in Customer' : 'Select Table'}
        </h2>

        {/* Step 1: Customer Information */}
        {step === 1 && (
          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Party Size *
            </label>
            <input
              type="number"
              min="1"
              max="20"
              required
              value={formData.party_size}
              onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              required
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Phone *
            </label>
            <input
              type="tel"
              required
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Location (Optional)
            </label>
            <select
              value={formData.preferred_location}
              onChange={(e) => setFormData({ ...formData, preferred_location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
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
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Customer</div>
                  <div className="font-semibold text-gray-900">{formData.customer_name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Party Size</div>
                  <div className="font-semibold text-gray-900">{formData.party_size} guests</div>
                </div>
              </div>
            </div>

            {/* Table Combination Selector */}
            <TableCombinationSelector
              availableTables={filteredTables}
              partySize={parseInt(formData.party_size)}
              onSelect={setSelectedTableIds}
              selectedTableIds={selectedTableIds}
            />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleBack}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleProceedToSeat}
                className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
