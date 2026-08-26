import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ChipSelectorProps {
  items: string[];
  presets: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  maxItems?: number;
}

export default function ChipSelector({
  items,
  presets,
  onChange,
  placeholder,
  maxItems = 20,
}: ChipSelectorProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  const addItem = useCallback(
    (raw: string) => {
      const item = raw.trim();
      if (!item) return;
      if (items.length >= maxItems) return;
      if (items.some((i) => i.toLowerCase() === item.toLowerCase())) return;
      onChange([...items, item]);
      setInput('');
    },
    [items, maxItems, onChange]
  );

  const removeItem = useCallback(
    (itemToRemove: string) => {
      onChange(items.filter((i) => i !== itemToRemove));
    },
    [items, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(input);
    }
  };

  const availablePresets = presets.filter(
    (p) => !items.some((i) => i.toLowerCase() === p.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-700 px-2 py-1 rounded-md border border-[#E7E5E4]"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="text-stone-400 hover:text-[#9F1239] transition-colors"
              aria-label={t('crm.removeChip', { item })}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}

        {/* Preset chips (unselected) */}
        {availablePresets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => addItem(preset)}
            className="text-xs text-stone-400 px-2 py-1 rounded-md border border-dashed border-stone-300 hover:border-[#9F1239] hover:text-[#9F1239] transition-colors"
          >
            + {preset}
          </button>
        ))}
      </div>

      {/* Custom input */}
      {items.length < maxItems && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('crm.addCustom', 'Add custom...')}
          className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
        />
      )}
    </div>
  );
}
