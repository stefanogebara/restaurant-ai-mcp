import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './voiceConstants';
import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  currentLanguage: string;
  savedLanguage: string | undefined;
  onChange: (lang: string) => void;
}

export default function VoiceLanguagePicker({ currentLanguage, savedLanguage, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <section className="border-b border-brand-line pb-5 font-brand text-brand-ink">
      <div className="pb-2 pt-1">
        <label htmlFor="voice-language" className="text-[16px] font-medium tracking-[-0.02em] text-brand-ink">{t('voiceSettings.languages')}</label>
      </div>

      <div className="pt-1">
        <div className="relative">
        <select
          id="voice-language"
          value={currentLanguage}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={currentLanguage !== savedLanguage ? 'voice-language-warning' : undefined}
          className="min-h-10 w-full appearance-none rounded-none border-0 border-b border-brand-line bg-transparent px-0 py-2 pr-10 text-[15px] text-brand-ink focus-visible:border-brand-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {!SUPPORTED_LANGUAGES.some((lang) => lang.code === currentLanguage) && (
            <option value={currentLanguage}>{currentLanguage}</option>
          )}
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
        <ThiingsIcon name="chevron-down" pxSize={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-brand-ink" />
        </div>

        {currentLanguage !== savedLanguage && (
          <p id="voice-language-warning" role="status" className="mt-3 max-w-xl border-l-2 border-amber-600 pl-3 text-xs leading-5 text-amber-700">
            {t('voiceSettings.languageChangeWarning')}
          </p>
        )}
      </div>
    </section>
  );
}
