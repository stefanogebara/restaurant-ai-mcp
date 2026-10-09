import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './voiceConstants';
import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  currentLanguage: string;
  savedLanguage: string | undefined;
  onChange: (lang: string) => void;
}

export default function VoiceLanguagePicker({ currentLanguage, savedLanguage, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
  const nameFor = (code: string) => {
    const name = languageNames.of(code) || code.toUpperCase();
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  };
  return (
    <section className="min-w-0 py-3 font-brand text-brand-ink sm:py-0">
      <div className="flex min-w-0 items-center justify-between gap-3 sm:block">
        <label htmlFor="voice-language" className="font-brand text-[13px] font-medium text-brand-muted">{t('voiceSettings.languages')}</label>
        <div className="relative min-w-0 w-40 max-w-[58%] sm:mt-0.5 sm:max-w-[190px] sm:w-full">
        <select
          id="voice-language"
          value={currentLanguage}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={currentLanguage !== savedLanguage ? 'voice-language-warning' : undefined}
          className="min-h-11 w-full appearance-none rounded-none border-0 bg-transparent px-0 py-1 pr-6 text-left text-[16px] font-medium text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {!SUPPORTED_LANGUAGES.some((lang) => lang.code === currentLanguage) && (
            <option value={currentLanguage}>{nameFor(currentLanguage)}</option>
          )}
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{nameFor(lang.code)}</option>
          ))}
        </select>
        <ThiingsIcon name="chevron-down" pxSize={14} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-brand-ink" />
        </div>
      </div>
      {currentLanguage !== savedLanguage && (
        <p id="voice-language-warning" role="status" className="mt-1 max-w-xl border-l-2 border-amber-600 pl-3 text-xs leading-5 text-amber-700">
          {t('voiceSettings.languageChangeWarning')}
        </p>
      )}
    </section>
  );
}
