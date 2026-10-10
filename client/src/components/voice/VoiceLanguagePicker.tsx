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
    <section className="min-w-0 py-4 font-brand text-brand-ink">
      <div className="grid min-w-0 grid-cols-1 items-center md:grid-cols-[150px_minmax(0,1fr)] md:gap-x-4">
        <label htmlFor="voice-language" className="col-start-1 row-start-1 font-brand text-[13px] font-medium text-brand-muted">{t('voiceSettings.languages')}</label>
        <div className="relative col-start-1 row-start-2 min-w-0 w-full md:col-start-2 md:row-start-1">
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
