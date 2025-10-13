import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { hostAPI } from '../../services/api';

interface WalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
}

export default function WalkInModal({ isOpen, onClose, onSuccess }: WalkInModalProps) {
  const [formData, setFormData] = useState({
    party_size: '',
    customer_name: '',
    customer_phone: '',
    preferred_location: '',
  });

  const checkWalkInMutation = useMutation({
    mutationFn: (data: { party_size: number; preferred_location?: string }) =>
      hostAPI.checkWalkIn(data.party_size, data.preferred_location),
    onSuccess: (response) => {
      const recommendation = response.data.recommendation;
      onSuccess({
        type: 'walk-in',
        ...formData,
        party_size: parseInt(formData.party_size),
        table_ids: recommendation?.tables || [],
        recommendations: response.data,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkWalkInMutation.mutate({
      party_size: parseInt(formData.party_size),
      preferred_location: formData.preferred_location || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Add Walk-in Customer</h2>

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

          {checkWalkInMutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              Error checking availability. Please try again.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={checkWalkInMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={checkWalkInMutation.isPending}
            >
              {checkWalkInMutation.isPending ? 'Checking...' : 'Find Tables'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
