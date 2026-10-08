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
            className="inline-flex items-center gap-1 rounded-md border border-brand-line bg-white/70 px-2 py-1 text-xs text-brand-ink"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="text-brand-muted hover:text-red-700 transition-colors"
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
            className="rounded-md border border-brand-line px-2 py-1 text-xs text-brand-muted transition-colors hover:border-brand-action hover:text-brand-action"
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
          className="w-full rounded-lg border border-brand-line bg-white/70 px-3 py-2 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action"
        />
      )}
    </div>
  );
}
