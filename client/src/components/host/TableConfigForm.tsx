import type { Dispatch, SetStateAction } from 'react';

export interface TableFormData {
  table_number: number;
  capacity: number;
  location: string;
  is_fixed: boolean;
  combination_group: string;
}

interface TableConfigFormProps {
  formData: TableFormData;
  setFormData: Dispatch<SetStateAction<TableFormData>>;
  locations: string[];
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel: string;
}

export default function TableConfigForm({
  formData,
  setFormData,
  locations,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: TableConfigFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">Table Number</label>
          <input
            type="number"
            min="1"
            value={formData.table_number}
            onChange={(e) => setFormData({ ...formData, table_number: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">Capacity</label>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-gray mb-1">Location</label>
        <div className="flex gap-2">
          <select
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="flex-1 px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          >
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__new__">+ New Location</option>
          </select>
        </div>
        {formData.location === '__new__' && (
          <input
            type="text"
            aria-label="New location name"
            placeholder="Enter new location name"
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="mt-2 w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-gray mb-1">Table Type</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!formData.is_fixed}
              onChange={() => setFormData({ ...formData, is_fixed: false })}
              className="w-4 h-4 text-rose-500 accent-rose-500"
            />
            <span className="text-sm text-warm-stone">Flexible (can combine)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={formData.is_fixed}
              onChange={() => setFormData({ ...formData, is_fixed: true })}
              className="w-4 h-4 text-amber-600 accent-amber-600"
            />
            <span className="text-sm text-warm-stone">Fixed (booth/round)</span>
          </label>
        </div>
      </div>

      {!formData.is_fixed && (
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">
            Combination Group (optional)
          </label>
          <input
            type="text"
            value={formData.combination_group}
            onChange={(e) => setFormData({ ...formData, combination_group: e.target.value })}
            placeholder="e.g., window-row, center-section"
            className="w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
          <p className="text-xs text-muted-stone mt-1">
            Tables in the same group can be combined together
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-deep-charcoal text-white rounded-xl hover:bg-charcoal-dark transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  );
}
