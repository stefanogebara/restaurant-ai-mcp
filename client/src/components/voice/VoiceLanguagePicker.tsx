import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './voiceConstants';

interface Props {
  currentLanguage: string;
  savedLanguage: string | undefined;
  onChange: (lang: string) => void;
}

export default function VoiceLanguagePicker({ currentLanguage, savedLanguage, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <section className="border-b border-brand-line pb-6 font-brand text-brand-ink">
      <div className="py-4">
        <label htmlFor="voice-language" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">{t('voiceSettings.languages')}</label>
      </div>

      <div className="pt-1">
        <select
          id="voice-language"
          value={currentLanguage}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={currentLanguage !== savedLanguage ? 'voice-language-warning' : undefined}
          className="min-h-11 w-full max-w-xs rounded-lg border border-brand-line bg-transparent px-3 py-2 text-sm text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {!SUPPORTED_LANGUAGES.some((lang) => lang.code === currentLanguage) && (
            <option value={currentLanguage}>{currentLanguage}</option>
          )}
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>

        {currentLanguage !== savedLanguage && (
          <p id="voice-language-warning" role="status" className="mt-3 max-w-xl border-l-2 border-amber-600 pl-3 text-xs leading-5 text-amber-700">
            {t('voiceSettings.languageChangeWarning')}
          </p>
        )}
      </div>
    </section>
  );
}
