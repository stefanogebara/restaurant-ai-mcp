import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import PhoneIntegrationPanel from './PhoneIntegrationPanel';

/** No individual agent means no voice writes. Saved phone setup is still readable. */
export default function VoicePhoneOnlyState() {
  const { t } = useTranslation();
  return (
    <div className="p-6 mt-14 lg:mt-0 lg:p-8 max-w-5xl">
      <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
            {t('voiceSettings.pageEyebrow')}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
            {t('voiceSettings.pageTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-stone">
            {t('voiceSettings.noIndividualAgentIntro')}
          </p>
        </div>
        <Link to="/host-dashboard/calls"
          className="liquid-capsule inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-soft-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60">
          <ThiingsIcon name="phone-call" size="sm" />
          {t('navigation.callHistory')}
        </Link>
      </div>
      <div className="border-t border-glass-border-dark">
        <PhoneIntegrationPanel />
      </div>
    </div>
  );
}
