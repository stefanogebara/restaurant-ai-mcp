import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import { useTranslation } from 'react-i18next';

interface OnboardingSuccessModalProps {
  countdown: number;
  ownReferral: { code: string; url: string } | null;
  bookingUrl: string | null;
}

export default function OnboardingSuccessModal({ countdown, ownReferral, bookingUrl }: OnboardingSuccessModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyBookingUrl = () => {
    if (!bookingUrl) return;
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-white border border-border-gray rounded-2xl p-10 max-w-md w-full">
        <div className="text-center">
          <div className="w-20 h-20 bg-burgundy rounded-full flex items-center justify-center mx-auto mb-6">
            <ThiingsIcon name="check" pxSize={40} className="text-white" />
          </div>
          <h2 className="font-serif text-3xl font-medium text-deep-charcoal mb-3">{t('onboarding.welcomeAboard')}</h2>
          <p className="text-[15px] text-stone-gray font-light mb-6">
            {t('onboarding.restaurantReady')}
          </p>

          {/* Booking URL — the most important thing to share */}
          {bookingUrl && (
            <div className="mb-6 border border-border-gray rounded-2xl p-4 text-left">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-burgundy mb-2">
                {t('onboarding.yourBookingLink', 'Seu link de reservas')}
              </p>
              <p className="text-[12px] text-stone-gray mb-3">
                {t('onboarding.bookingLinkDesc', 'Compartilhe este link no Instagram, Google e WhatsApp para receber reservas.')}
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-soft-gray border border-border-gray rounded-lg px-3 py-2 text-[12px] text-deep-charcoal font-mono truncate">
                  {bookingUrl}
                </div>
                <button
                  type="button"
                  onClick={handleCopyBookingUrl}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-[12px] font-semibold rounded-lg transition-colors"
                >
                  <ThiingsIcon name={copied ? 'check' : 'copy'} pxSize={14} />
                  {copied ? t('onboarding.copied', 'Copiado!') : t('onboarding.copy', 'Copiar')}
                </button>
              </div>
            </div>
          )}

          {/* Referral share nudge */}
          {ownReferral && (() => {
            const referralUrl = ownReferral.url;
            const whatsappText = encodeURIComponent(`I just joined Seatable – the AI that manages restaurant reservations. Try it free: ${referralUrl}`);
            const emailSubject = encodeURIComponent('Try Seatable – AI reservations for restaurants');
            const emailBody = encodeURIComponent(`Hey,\n\nI just started using Seatable – it handles restaurant reservations with AI. Thought you might find it useful.\n\nTry it free here: ${referralUrl}\n\nCheers`);
            return (
              <div className="mb-6 border border-border-gray rounded-2xl p-4">
                <p className="text-[13px] font-medium text-deep-charcoal mb-3">
                  {t('onboarding.referralNudge')}
                </p>
                <div className="flex gap-3 justify-center">
                  <a
                    href={`https://wa.me/?text=${whatsappText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#1ebe5d] transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-deep-charcoal text-white text-[13px] font-medium hover:bg-charcoal-dark transition-colors"
                  >
                    <ThiingsIcon name="mail" pxSize={16} />
                    Email
                  </a>
                </div>
              </div>
            );
          })()}

          <button
            onClick={() => { window.location.href = '/host-dashboard/simple'; }}
            className="w-full px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 mb-2"
          >
            {t('onboarding.goToDashboard')} →
          </button>
          <p className="text-sm text-stone-gray text-center">
            {t('onboarding.redirectingIn', { count: countdown })}
          </p>
        </div>
      </div>
    </div>
  );
}
