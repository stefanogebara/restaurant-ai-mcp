import { useTranslation } from 'react-i18next';
import { getVoiceLanguageLabel, SUPPORTED_LANGUAGES } from './voiceConstants';

interface Props {
  currentLanguage: string;
  savedLanguage: string | undefined;
  onChange: (lang: string) => void;
}

export default function VoiceLanguagePicker({ currentLanguage, savedLanguage, onChange }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <section className="overflow-hidden pb-5 border-b border-glass-border-dark">
      <div className="py-5 border-b border-glass-border-dark">
        <label htmlFor="voice-language" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('voiceSettings.languages')}</label>
      </div>

      <div className="py-6">
        <select
          id="voice-language"
          value={currentLanguage.split('-')[0]}
          onChange={(event) => onChange(event.target.value)}
          className="w-full max-w-sm min-h-12 rounded-xl border border-glass-border-input bg-white/60 px-4 py-2.5 text-[15px] text-deep-charcoal backdrop-blur-glass-chip focus:outline-none focus:ring-2 focus:ring-burgundy/50"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {getVoiceLanguageLabel(lang, i18n.language)}
            </option>
          ))}
        </select>

        {currentLanguage !== savedLanguage && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-600/10 rounded-xl px-3 py-2">
            {t('voiceSettings.languageChangeWarning')}
          </p>
        )}
      </div>
    </section>
  );
}
