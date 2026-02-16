import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LanguageSelector from '../components/common/LanguageSelector';
import ThiingsIcon from '../components/common/ThiingsIcon';

export default function LanguageSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAFAF9] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 bg-[#F5F5F4] hover:bg-[#E7E5E4] px-3 py-1.5 rounded-xl transition-colors inline-flex items-center gap-1"
        >
          <ThiingsIcon name="arrow-left" size="sm" />
          <span className="text-[#57534E]">{t('common.back')}</span>
        </button>

        {/* Settings card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E7E5E4] p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-[#9F1239]/10 rounded-xl">
              <ThiingsIcon name="globe" pxSize={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#1C1917] flex items-center">
                <span className="w-2 h-2 rounded-full bg-[#9F1239] inline-block mr-2" />
                {t('settings.languageSettings')}
              </h1>
              <p className="text-[#57534E] mt-1">
                {t('onboarding.languageDescription')}
              </p>
            </div>
          </div>

          {/* Language selector */}
          <div className="space-y-6">
            <div className="p-6 bg-[#FAFAF9] rounded-xl">
              <LanguageSelector
                variant="buttons"
                size="lg"
                onLanguageChange={(_lang) => {
                }}
              />
            </div>

            {/* Info text */}
            <div className="flex items-start gap-3 p-4 bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl">
              <div className="flex-shrink-0">
                <svg
                  className="w-5 h-5 text-[#9F1239] mt-0.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div className="text-sm text-[#57534E]">
                <p className="font-medium mb-1 text-[#1C1917]">Language preferences</p>
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
            className="p-6 bg-white rounded-xl shadow-sm border border-[#E7E5E4] hover:shadow-md transition-shadow text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#9F1239]"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                </svg>
              </div>
              <h3 className="font-semibold text-[#1C1917]">
                {t('navigation.dashboard')}
              </h3>
            </div>
            <p className="text-sm text-[#57534E]">
              Return to your main dashboard
            </p>
          </button>

          <button
            onClick={() => navigate('/subscription/manage')}
            className="p-6 bg-white rounded-xl shadow-sm border border-[#E7E5E4] hover:shadow-md transition-shadow text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#9F1239]"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
              </div>
              <h3 className="font-semibold text-[#1C1917]">
                {t('settings.general')}
              </h3>
            </div>
            <p className="text-sm text-[#57534E]">
              Manage your subscription and settings
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
