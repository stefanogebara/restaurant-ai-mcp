import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LanguageSelector from '../components/common/LanguageSelector';
import ThiingsIcon from '../components/common/ThiingsIcon';

export default function LanguageSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-warm-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 bg-soft-gray hover:bg-border-gray px-3 py-1.5 rounded-xl transition-colors inline-flex items-center gap-1"
        >
          <ThiingsIcon name="arrow-left" size="sm" />
          <span className="text-stone-gray">{t('common.back')}</span>
        </button>

        {/* Settings card */}
        <div className="bg-white rounded-2xl shadow-sm border border-border-gray p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-burgundy/10 rounded-xl">
              <ThiingsIcon name="globe" pxSize={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight flex items-center">
                <span className="w-2 h-2 rounded-full bg-burgundy inline-block mr-2" />
                {t('settings.languageSettings')}
              </h1>
              <p className="text-stone-gray mt-1">
                {t('onboarding.languageDescription')}
              </p>
            </div>
          </div>

          {/* Language selector */}
          <div className="space-y-6">
            <div className="p-6 bg-warm-white rounded-xl">
              <LanguageSelector
                variant="buttons"
                size="lg"
                onLanguageChange={(_lang) => {
                }}
              />
            </div>

            {/* Info text */}
            <div className="flex items-start gap-3 p-4 bg-burgundy/5 border border-burgundy/20 rounded-xl">
              <div className="flex-shrink-0">
                <ThiingsIcon name="info" pxSize={20} className="text-burgundy mt-0.5" />
              </div>
              <div className="text-sm text-stone-gray">
                <p className="font-medium mb-1 text-deep-charcoal">Language preferences</p>
                <p>
                  Your language selection will be applied to the entire dashboard,
                  all customer communications, and AI interactions. This change takes
                  effect immediately and is saved automatically.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Additional settings suggestions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/host-dashboard')}
            className="p-6 bg-white rounded-2xl shadow-sm border border-border-gray hover:shadow-md transition-shadow text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center">
                <ThiingsIcon name="home" pxSize={20} className="text-burgundy" />
              </div>
              <h3 className="font-semibold text-deep-charcoal">
                {t('navigation.dashboard')}
              </h3>
            </div>
            <p className="text-sm text-stone-gray">
              Return to your main dashboard
            </p>
          </button>

          <button
            onClick={() => navigate('/subscription/manage')}
            className="p-6 bg-white rounded-2xl shadow-sm border border-border-gray hover:shadow-md transition-shadow text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center">
                <ThiingsIcon name="gear" pxSize={20} className="text-burgundy" />
              </div>
              <h3 className="font-semibold text-deep-charcoal">
                {t('settings.general')}
              </h3>
            </div>
            <p className="text-sm text-stone-gray">
              Manage your subscription and settings
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
