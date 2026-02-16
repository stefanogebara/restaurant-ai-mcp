import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languageOptions } from '../../i18n/config';
import axios from 'axios';

interface LanguageSelectorProps {
  onLanguageChange?: (language: string) => void;
  showLabel?: boolean;
  variant?: 'dropdown' | 'buttons';
  size?: 'sm' | 'md' | 'lg';
}

export default function LanguageSelector({
  onLanguageChange,
  showLabel = true,
  variant = 'dropdown',
  size = 'md',
}: LanguageSelectorProps) {
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLanguage = i18n.language;

  const handleLanguageChange = async (languageCode: string) => {
    if (languageCode === currentLanguage) return;

    setIsLoading(true);
    setError(null);

    try {
      // Change language in i18n
      await i18n.changeLanguage(languageCode);

      // Save to localStorage
      localStorage.setItem('i18nextLng', languageCode);

      // Try to save to database if restaurant is logged in
      const restaurantId = localStorage.getItem('restaurant_id');
      if (restaurantId) {
        try {
          await axios.put(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/restaurant-settings`,
            { language: languageCode },
            {
              headers: {
                'Content-Type': 'application/json',
                'x-restaurant-id': restaurantId,
              },
            }
          );
        } catch (dbError) {
          console.warn('Failed to save language to database:', dbError);
          // Continue anyway - local storage will persist the change
        }
      }

      // Call custom callback if provided
      if (onLanguageChange) {
        onLanguageChange(languageCode);
      }
    } catch (err) {
      console.error('Failed to change language:', err);
      setError(t('settings.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Size classes
  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-2',
    lg: 'text-lg px-4 py-3',
  };

  if (variant === 'buttons') {
    return (
      <div className="space-y-2">
        {showLabel && (
          <label className="block text-sm font-medium text-[#57534E]">
            {t('common.language')}
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {languageOptions.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              disabled={isLoading}
              className={`
                ${sizeClasses[size]}
                flex items-center gap-2 rounded-lg border-2 transition-all
                ${
                  currentLanguage === lang.code
                    ? 'border-[#9F1239] bg-[#9F1239]/5 text-[#9F1239] font-semibold'
                    : 'border-[#E7E5E4] bg-white text-[#57534E] hover:border-[#A8A29E]'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <span className="text-xl">{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}
      </div>
    );
  }

  // Dropdown variant (default)
  return (
    <div className="space-y-2">
      {showLabel && (
        <label htmlFor="language-selector" className="block text-sm font-medium text-[#57534E]">
          {t('common.language')}
        </label>
      )}
      <div className="relative">
        <select
          id="language-selector"
          value={currentLanguage}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={isLoading}
          className={`
            ${sizeClasses[size]}
            block w-full rounded-lg border-[#E7E5E4] shadow-sm
            focus:border-[#9F1239] focus:ring-[#9F1239]
            disabled:opacity-50 disabled:cursor-not-allowed
            bg-white
          `}
        >
          {languageOptions.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name}
            </option>
          ))}
        </select>
        {isLoading && (
          <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-[#9F1239] border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
    </div>
  );
}
