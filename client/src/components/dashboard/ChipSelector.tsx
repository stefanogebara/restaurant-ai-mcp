import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ChipSelectorProps {
  items: string[];
  presets: Array<{ value: string; label: string; aliases?: string[] }>;
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

  const matchingPreset = useCallback((item: string) =>
    presets.find(({ value, aliases = [] }) =>
      [value, ...aliases].some((alias) => alias.toLocaleLowerCase() === item.toLocaleLowerCase())
    ), [presets]);

  const canonicalize = useCallback((values: string[]) => {
    const seen = new Set<string>();
    return values.map((value) => matchingPreset(value)?.value ?? value).filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [matchingPreset]);

  const addItem = useCallback(
    (raw: string) => {
      const item = matchingPreset(raw.trim())?.value ?? raw.trim();
      if (!item) return;
      if (items.length >= maxItems) return;
      if (items.some((i) => (matchingPreset(i)?.value ?? i).toLocaleLowerCase() === item.toLocaleLowerCase())) return;
      onChange(canonicalize([...items, item]));
      setInput('');
    },
    [items, maxItems, onChange, matchingPreset, canonicalize]
  );

  const removeItem = useCallback(
    (itemToRemove: string) => {
      onChange(canonicalize(items.filter((i) => i !== itemToRemove)));
    },
    [items, onChange, canonicalize]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(input);
    }
  };

  const availablePresets = presets.filter(
    (p) => !items.some((i) => matchingPreset(i)?.value === p.value)
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
            {matchingPreset(item)?.label ?? item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="text-brand-muted hover:text-red-700 transition-colors"
              aria-label={t('crm.removeChip', { item: matchingPreset(item)?.label ?? item })}
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
            key={preset.value}
            type="button"
            onClick={() => addItem(preset.value)}
            className="rounded-md border border-brand-line px-2 py-1 text-xs text-brand-muted transition-colors hover:border-brand-action hover:text-brand-action"
          >
            + {preset.label}
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
