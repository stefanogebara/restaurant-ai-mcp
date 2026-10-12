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
            className="inline-flex items-center gap-1 rounded-[46px] border border-glass-border-dark bg-deep-charcoal/[0.04] px-2.5 py-1 text-xs text-deep-charcoal"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="text-muted-stone hover:text-burgundy transition-colors"
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
            className="rounded-[46px] border border-dashed border-glass-border-dark px-2.5 py-1 text-xs text-muted-stone transition-colors hover:border-burgundy/40 hover:text-burgundy"
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
          className="w-full glass-pill rounded-xl px-3.5 py-2.5 text-sm text-deep-charcoal placeholder:text-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30"
        />
      )}
    </div>
  );
}
