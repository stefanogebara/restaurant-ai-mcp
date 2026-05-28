import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useTranslation } from 'react-i18next';
import Spinner from '../components/common/Spinner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useVerifySession } from '../hooks/useVerifySession';
import { LS_STRIPE_CUSTOMER_ID, LS_SUBSCRIPTION_PLAN, LS_CUSTOMER_EMAIL, LS_PAYMENT_VERIFIED_AT } from '../config/localStorageKeys';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.subscriptionSuccess', 'Payment Confirmed | seatable'));

  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const { data, isLoading, isError } = useVerifySession(sessionId);

  // H1: failure surfaces explicitly instead of rendering fake success. data
  // can be undefined even when isError=false (e.g. session_id missing).
  const verificationFailed = !isLoading && (isError || !data);

  // Visible auto-redirect countdown. Previously this page silently jumped
  // away after 4 seconds — owners trying to screenshot the receipt for
  // accounting, or just read the page, lost the context with no warning.
  // Now we show a countdown and let the owner cancel it.
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const [autoRedirectCancelled, setAutoRedirectCancelled] = useState(false);

  // Side effects: persist to localStorage on successful verification
  useEffect(() => {
    if (!data) return;
    if (data.customer_id) localStorage.setItem(LS_STRIPE_CUSTOMER_ID, data.customer_id);
    if (data.plan) localStorage.setItem(LS_SUBSCRIPTION_PLAN, data.plan);
    if (data.customer_email) localStorage.setItem(LS_CUSTOMER_EMAIL, data.customer_email);
    // Record the moment we confirmed the payment so /subscription/manage can
    // distinguish "user paid but our webhook hasn't landed yet" from "user has
    // no plan" and avoid showing the upsell cards to a paying customer.
    localStorage.setItem(LS_PAYMENT_VERIFIED_AT, String(Date.now()));
    setRedirectIn(5);
  }, [data]);

  // Tick down the countdown each second, redirect at zero unless cancelled.
  useEffect(() => {
    if (redirectIn === null || autoRedirectCancelled) return;
    if (redirectIn <= 0) {
      navigate('/host-dashboard/simple?launch=1');
      return;
    }
    const timer = setTimeout(() => setRedirectIn((n) => (n ?? 0) - 1), 1000);
    return () => clearTimeout(timer);
  }, [redirectIn, autoRedirectCancelled, navigate]);

  // Log verification failures so Sentry catches Stripe/JWT outages
  useEffect(() => {
    if (verificationFailed) {
      console.error('[SubscriptionSuccess] verify-session failed', { sessionId, isError });
    }
  }, [verificationFailed, sessionId, isError]);

  // Even when verify-session fails, the Stripe redirect itself is proof that
  // the customer reached Checkout. If they have a session_id we still mark
  // them as "just paid" so /subscription/manage shows the pending-activation
  // state instead of the upsell cards (which would gaslight someone whose
  // card was just charged). Real-world trigger: 2h Stripe flow expired the
  // Supabase JWT, verify-session 401'd, but the subscription was actually
  // created on Stripe's side.
  useEffect(() => {
    if (verificationFailed && sessionId) {
      localStorage.setItem(LS_PAYMENT_VERIFIED_AT, String(Date.now()));
    }
  }, [verificationFailed, sessionId]);

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

  // Verification failed but the customer reached this page from Stripe (we
  // have a session_id in the URL). Render an "activating" state instead of
  // a hard error — the subscription almost certainly exists on Stripe's
  // side; what failed is our local read of it. Auto-redirect to the dashboard
  // so they're not stuck on this screen. The pending-activation marker we
  // set above means /subscription/manage will keep showing the activating
  // state until the webhook lands rather than flipping to the upsell page.
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
              <div className="w-16 h-16 rounded-full bg-rose-600/[8%] flex items-center justify-center mx-auto mb-5">
                <Spinner size="lg" />
              </div>
              <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">
                {t('subscription.activatingTitle', 'Activating your subscription')}
              </h1>
              <p className="text-sm text-warm-stone font-light mb-6">
                {t('subscription.activatingDesc', "Payment received. We're finalising your plan — this usually takes 30 seconds. You can stay on this page or head to your dashboard.")}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/host-dashboard/simple?launch=1')}
                  className="px-7 py-3 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
                >
                  {t('subscription.goToDashboard')}
                </button>
                <a
                  href="mailto:hello@seatable.one"
                  className="px-7 py-3 border border-border-gray text-stone-gray text-sm font-medium rounded-full hover:border-muted-stone transition-colors"
                >
                  {t('subscription.contactSupport', 'Contact Support')}
                </a>
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

            {redirectIn !== null && !autoRedirectCancelled ? (
              <p className="text-[13px] text-rose-600 font-medium mb-2">
                {t('subscription.redirectingIn', 'Redirecting to your dashboard in {{seconds}}s', { seconds: Math.max(0, redirectIn) })}
              </p>
            ) : (
              <p className="text-[13px] text-warm-stone mb-2">
                {t('subscription.staying', 'You can take your time on this page.')}
              </p>
            )}

            {redirectIn !== null && !autoRedirectCancelled && (
              <button
                type="button"
                onClick={() => setAutoRedirectCancelled(true)}
                className="text-xs text-burgundy hover:text-burgundy-dark underline underline-offset-2 mb-6"
              >
                {t('subscription.stayHere', 'Stay on this page')}
              </button>
            )}

            <div className="flex justify-center mt-2">
              <button
                type="button"
                onClick={() => navigate('/host-dashboard/simple?launch=1')}
                className="px-7 py-3 bg-deep-charcoal hover:bg-charcoal-dark text-white text-sm font-semibold rounded-full transition-colors"
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
