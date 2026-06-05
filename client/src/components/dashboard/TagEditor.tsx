import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface TagEditorProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  maxTags?: number;
}

const MAX_TAG_LENGTH = 50;

const SUGGESTED_TAGS = [
  'VIP',
  'Frequente',
  'Inativo',
  'Vegano',
  'Sem Gluten',
  'Aniversario',
];

export default function TagEditor({ tags, onTagsChange, maxTags = 20 }: TagEditorProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const addTag = useCallback(
    (raw: string) => {
      const tag = raw.trim().toLowerCase();
      if (!tag) return;
      if (tag.length > MAX_TAG_LENGTH) return;
      if (tags.length >= maxTags) return;
      if (tags.includes(tag)) return;
      onTagsChange([...tags, tag]);
      setInput('');
      setShowSuggestions(false);
    },
    [tags, maxTags, onTagsChange]
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onTagsChange(tags.filter((t) => t !== tagToRemove));
    },
    [tags, onTagsChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
    }
  };

  const availableSuggestions = SUGGESTED_TAGS.filter(
    (s) => !tags.includes(s.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Tag pills */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-700 px-2 py-1 rounded-md"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-[#9F1239] hover:text-[#7f0e2e] transition-colors"
                aria-label={t('crm.removeTag', { tag })}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      {tags.length < maxTags && (
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay to allow suggestion click
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder={t('crm.addTagPlaceholder', 'Adicionar tag...')}
            maxLength={MAX_TAG_LENGTH}
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
          />

          {/* Suggestions dropdown */}
          {showSuggestions && availableSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-glass-modal backdrop-blur-glass-modal border border-glass-border-dark rounded-lg shadow-glass-modal z-10 py-1">
              <p className="px-3 py-1 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                {t('crm.suggestions', 'Sugestoes')}
              </p>
              {availableSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(suggestion)}
                  className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Max tags hint */}
      {tags.length >= maxTags && (
        <p className="text-xs text-stone-400">
          {t('crm.maxTagsReached', 'Limite de tags atingido')}
        </p>
      )}
    </div>
  );
}
