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
    <section className="overflow-hidden pb-5 border-b border-[#E5E7EB]">
      <div className="py-5 border-b border-[#E5E7EB]">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('voiceSettings.languages')}</span>
      </div>

      <div className="p-6">
        <div className="flex gap-2 flex-wrap">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => onChange(lang.code)}
              className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-colors ${
                currentLanguage === lang.code
                  ? 'border-burgundy bg-burgundy/[6%] text-burgundy font-semibold'
                  : 'border-border-gray text-stone-gray bg-white hover:border-muted-stone'
              }`}
            >
              {lang.flag} {lang.label}
            </button>
          ))}
        </div>

        {currentLanguage !== savedLanguage && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-600/10 rounded-xl px-3 py-2">
            {t('voiceSettings.languageChangeWarning')}
          </p>
        )}
      </div>
    </section>
  );
}
