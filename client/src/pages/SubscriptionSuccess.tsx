import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useTranslation } from 'react-i18next';
import Spinner from '../components/common/Spinner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useVerifySession } from '../hooks/useVerifySession';
import { LS_STRIPE_CUSTOMER_ID, LS_SUBSCRIPTION_PLAN, LS_CUSTOMER_EMAIL } from '../config/localStorageKeys';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.subscriptionSuccess', 'Payment Confirmed | seatable'));

  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const { data, isLoading, isError } = useVerifySession(sessionId);

  // H1: failure surfaces explicitly instead of rendering fake success. data
  // can be undefined even when isError=false (e.g. session_id missing).
  const verificationFailed = !isLoading && (isError || !data);

  // Side effects: persist to localStorage + redirect after successful verification
  useEffect(() => {
    if (!data) return;
    if (data.customer_id) localStorage.setItem(LS_STRIPE_CUSTOMER_ID, data.customer_id);
    if (data.plan) localStorage.setItem(LS_SUBSCRIPTION_PLAN, data.plan);
    if (data.customer_email) localStorage.setItem(LS_CUSTOMER_EMAIL, data.customer_email);

    const timer = setTimeout(() => {
      navigate('/host-dashboard/simple?launch=1');
    }, 4000);
    return () => clearTimeout(timer);
  }, [data, navigate]);

  // Log verification failures so Sentry catches Stripe/JWT outages
  useEffect(() => {
    if (verificationFailed) {
      console.error('[SubscriptionSuccess] verify-session failed', { sessionId, isError });
    }
  }, [verificationFailed, sessionId, isError]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-[15px] text-warm-stone font-light">{t('subscription.verifying')}</p>
        </div>
      </div>
    );
  }

  // H1: verification failure — explicit error UI with support contact.
  // The card may have been charged (Stripe is the source of truth, not our
  // session verifier) so we tell the user that and offer support.
  if (verificationFailed) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col">
        <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
          <div className="font-serif text-lg font-semibold text-deep-charcoal">
            seatable<span className="text-burgundy">.</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-[480px] w-full">
            <div className="bg-white border border-border-gray rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/[8%] flex items-center justify-center mx-auto mb-5">
                <ThiingsIcon name="alert-circle" pxSize={28} className="text-amber-600" />
              </div>
              <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">
                {t('subscription.verifyFailedTitle', "We couldn't verify your payment")}
              </h1>
              <p className="text-sm text-warm-stone font-light mb-6">
                {t('subscription.verifyFailedDesc', 'Your card may have been charged, but we couldn\'t verify the session. If you were charged, your subscription will activate shortly. Contact support if this persists.')}
              </p>
              <div className="flex items-center justify-center gap-3">
                <a
                  href="mailto:hello@seatable.one"
                  className="px-7 py-3 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
                >
                  {t('subscription.contactSupport', 'Contact Support')}
                </a>
                <button
                  onClick={() => navigate('/host-dashboard/simple')}
                  className="px-7 py-3 border border-border-gray text-stone-gray text-sm font-medium rounded-full hover:border-muted-stone transition-colors"
                >
                  {t('subscription.goToDashboard')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // M1: only render the plan-specific welcome when we actually have a plan from
  // the backend. Drop the silent || 'Growth' fallback that disagreed with the
  // backend's || 'Starter' default.
  const plan = data?.plan;

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-[480px] w-full">
          {/* Success Card */}
          <div className="bg-white border border-border-gray rounded-2xl p-12 text-center">
            {/* Green Checkmark */}
            <div className="w-16 h-16 rounded-full bg-rose-600/[8%] flex items-center justify-center mx-auto mb-5">
              <ThiingsIcon name="check" pxSize={28} className="text-rose-600" />
            </div>

            <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">
              {plan ? t('subscription.welcomeTo', { plan }) : t('subscription.welcomeGeneric', 'Payment confirmed!')}
            </h1>
            <p className="text-sm text-warm-stone font-light mb-6">
              {t('subscription.upgradeActive')}
            </p>

            <p className="text-[13px] text-rose-600 font-medium mb-6">
              {t('subscription.redirecting')}
            </p>

            <button
              onClick={() => navigate('/host-dashboard/simple?launch=1')}
              className="px-7 py-3 bg-deep-charcoal hover:bg-charcoal-dark text-white text-sm font-semibold rounded-full transition-colors"
            >
              {t('subscription.goToDashboard')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
