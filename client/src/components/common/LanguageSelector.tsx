import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { languageOptions, preloadAndSwitchLanguage } from '../../i18n/config';
import { authFetch } from '../../services/api';
import { LS_LANGUAGE } from '../../config/localStorageKeys';

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

  const currentLanguage = i18n.language;

  const updateLanguage = useMutation({
    mutationFn: async (languageCode: string) => {
      await preloadAndSwitchLanguage(languageCode);
      localStorage.setItem(LS_LANGUAGE, languageCode);

      // LS_RESTAURANT_ID is read but never written anywhere — every read
      // returned null and silently skipped the PUT. Result: language toggle
      // persisted locally but reverted on next OAuth session.
      // The backend resolves restaurant_id from the JWT, so we can fire the
      // PUT unconditionally as long as the user is authenticated. Best-effort
      // — localStorage already persists the local change.
      try {
        await authFetch('/api/restaurant-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: languageCode }),
        });
      } catch (dbError) {
        console.warn('Failed to save language to database:', dbError);
      }
      return languageCode;
    },
    onSuccess: (languageCode) => {
      onLanguageChange?.(languageCode);
    },
  });

  const handleLanguageChange = (languageCode: string) => {
    if (languageCode === currentLanguage) return;
    updateLanguage.mutate(languageCode);
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
          <label className="block text-sm font-medium text-stone-gray">
            {t('common.language')}
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {languageOptions.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              disabled={updateLanguage.isPending}
              className={`
                ${sizeClasses[size]}
                flex items-center gap-2 rounded-2xl border-2 transition-all
                ${
                  currentLanguage === lang.code
                    ? 'border-burgundy bg-burgundy/5 text-burgundy font-semibold'
                    : 'border-border-gray bg-white text-stone-gray hover:border-muted-stone'
                }
                ${updateLanguage.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <span className="text-xl">{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
        {updateLanguage.isError && (
          <p className="text-sm text-red-600 mt-2">{t('settings.updateFailed')}</p>
        )}
      </div>
    );
  }

  // Dropdown variant (default)
  return (
    <div className="space-y-2">
      {showLabel && (
        <label htmlFor="language-selector" className="block text-sm font-medium text-stone-gray">
          {t('common.language')}
        </label>
      )}
      <div className="relative">
        <select
          id="language-selector"
          value={currentLanguage}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={updateLanguage.isPending}
          className={`
            ${sizeClasses[size]}
            block w-full rounded-xl border-border-gray shadow-sm
            focus:border-burgundy focus:ring-burgundy
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
        {updateLanguage.isPending && (
          <div aria-hidden="true" className="absolute right-10 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-burgundy border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>
      {updateLanguage.isError && (
        <p className="text-sm text-red-600 mt-2">{t('settings.updateFailed')}</p>
      )}
    </div>
  );
}
