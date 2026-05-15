import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">
            {t('tableConfig.tableNumber', 'Table number')}
          </label>
          <input
            type="number"
            min="1"
            value={formData.table_number}
            onChange={(e) => setFormData({ ...formData, table_number: parseInt(e.target.value, 10) || 1 })}
            className="w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">
            {t('tableConfig.seats', 'How many people fit?')}
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 1 })}
            className="w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-gray mb-1">
          {t('tableConfig.location', 'Area')}
        </label>
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
            <option value="__new__">{t('tableConfig.newLocation', '+ New area')}</option>
          </select>
        </div>
        {formData.location === '__new__' && (
          <input
            type="text"
            aria-label={t('tableConfig.newLocationName', 'New area name')}
            placeholder={t('tableConfig.newLocationPlaceholder', 'e.g. Terrace, Bar, Patio')}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="mt-2 w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-gray mb-1">
          {t('tableConfig.tableType', 'Can this table be joined with others?')}
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!formData.is_fixed}
              onChange={() => setFormData({ ...formData, is_fixed: false })}
              className="w-4 h-4 text-rose-500 accent-rose-500"
            />
            <span className="text-sm text-warm-stone">{t('tableConfig.flexible', 'Yes — can join with nearby tables for bigger parties')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={formData.is_fixed}
              onChange={() => setFormData({ ...formData, is_fixed: true })}
              className="w-4 h-4 text-amber-600 accent-amber-600"
            />
            <span className="text-sm text-warm-stone">{t('tableConfig.fixed', 'No — stays as a single table (booth, round, etc.)')}</span>
          </label>
        </div>
      </div>

      {!formData.is_fixed && (
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">
            {t('tableConfig.combinationGroup', 'Which tables can be joined? (optional)')}
          </label>
          <input
            type="text"
            value={formData.combination_group}
            onChange={(e) => setFormData({ ...formData, combination_group: e.target.value })}
            placeholder={t('tableConfig.combinationPlaceholder', 'e.g. window-row, terrace-front')}
            className="w-full px-3 py-2 border border-border-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
          <p className="text-xs text-muted-stone mt-1">
            {t('tableConfig.combinationHint', 'Give the same name to tables that sit next to each other so the AI can join them into bigger groups.')}
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-deep-charcoal text-white rounded-xl hover:bg-charcoal-dark transition-colors disabled:opacity-50"
        >
          {isLoading ? t('common.saving', 'Saving...') : submitLabel}
        </button>
      </div>
    </div>
  );
}
