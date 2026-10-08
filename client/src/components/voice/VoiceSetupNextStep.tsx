import { useTranslation } from 'react-i18next';
import { usePhoneIntegration } from '../../hooks/usePhoneIntegration';

/** The next step is based on line ownership, never on agent registration alone. */
export default function VoiceSetupNextStep({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { status, isLoading, isError } = usePhoneIntegration();
  const assigned = status?.restaurant?.has_agent === true
    && status?.restaurant?.status === 'active'
    && status?.platform?.line_availability === 'owned_by_this_restaurant';
  const uncertain = isError || (!isLoading && (!status?.restaurant || !status?.platform
    || status.restaurant.status === 'unknown'
    || status.restaurant.status === 'error'
    || status.restaurant.status === 'unavailable'
    || !status.platform.line_availability
    || status.platform.line_availability === 'unknown'));

  const headline = isLoading
    ? t('voiceSettings.nextStep.loadingTitle', 'Checking the phone line.')
    : uncertain
      ? t('voiceSettings.nextStep.unknownTitle', 'Check the line before forwarding calls.')
      : assigned
        ? t('voiceSettings.nextStep.testTitle', 'Test the first real call.')
        : t('voiceSettings.nextStep.setupTitle', 'Ask us to set up your line.');
  const description = isLoading
    ? t('voiceSettings.nextStep.loadingDesc', 'Your voice is saved. We are checking who owns the line.')
    : uncertain
      ? t('voiceSettings.nextStep.unknownDesc', 'We could not confirm who receives calls on this line. Open Phone to retry or ask for help.')
      : assigned
        ? t('voiceSettings.nextStep.testDesc', 'This line is assigned to your restaurant. Call from another phone and confirm that the AI completes a reservation.')
        : t('voiceSettings.nextStep.setupDesc', 'Seatable support assigns the line safely. Do not forward customer calls until setup is confirmed.');

  return (
    <section aria-labelledby="voice-next-step" className={compact ? 'mb-5 border-b border-brand-line pb-5' : 'mb-5 border-b border-brand-line pb-5 sm:mb-10 sm:pb-10'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="max-w-[680px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            {t('voiceSettings.nextStep.eyebrow', 'Next step')}
          </p>
          <h2 id="voice-next-step" className={compact ? 'mt-1.5 font-brand text-[18px] font-medium leading-snug text-brand-ink' : 'mt-1.5 font-serif text-[28px] font-normal leading-[1.08] tracking-[-0.045em] text-brand-ink sm:mt-2 sm:text-[38px]'}>
            {headline}
          </h2>
          <p className={compact ? 'mt-1 max-w-[62ch] text-sm leading-6 text-brand-muted' : 'mt-2 max-w-[62ch] text-[15px] leading-6 text-brand-muted sm:mt-3'}>{description}</p>
        </div>
        <a href="#voice-settings:phone" className={compact ? 'inline-flex w-fit shrink-0 items-center justify-center rounded-full border border-brand-line px-4 py-2 text-sm font-semibold text-brand-action hover:bg-brand-action/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action' : 'inline-flex w-fit shrink-0 items-center justify-center rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action'}>
          {assigned
            ? t('voiceSettings.nextStep.viewTest', 'See number and test steps')
            : t('voiceSettings.nextStep.viewSetup', 'See setup steps')}
          <span aria-hidden="true" className="ml-2">→</span>
        </a>
      </div>
    </section>
  );
}
