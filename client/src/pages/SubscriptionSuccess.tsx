import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { checkoutResult, useVerifySession } from '../hooks/useVerifySession';
import { billingPlanFromName, clearBillingPlan, markVerifiedCheckout } from '../lib/billingHandoff';

const DASHBOARD = '/host-dashboard/simple?launch=1';
const RESULT_COPY = {
  paid: ['subscription.paidTitle', 'subscription.activeDescription'],
  trial: ['subscription.trialStartedTitle', 'subscription.trialStartedDescription'],
  active: ['subscription.activeTitle', 'subscription.activeDescription'],
} as const;

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  useDocumentTitle(t('pageTitles.subscriptionSuccess'));

  const sessionId = searchParams.get('session_id');
  const { data, isFetching, isError, refetch } = useVerifySession(sessionId, userId);
  const result = checkoutResult(data);
  const accessConfirmed = Boolean(result && !isFetching && !isError && data?.access_confirmed === true);
  const accessPending = Boolean(result && !accessConfirmed);
  const plan = result ? billingPlanFromName(data?.plan) : null;
  const [redirectAt, setRedirectAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (!result || !userId) return;
    clearBillingPlan(userId, plan);
    markVerifiedCheckout(userId);
  }, [result, userId, plan, sessionId]);

  useEffect(() => {
    if (!accessConfirmed) return;
    setSecondsLeft(5);
    setRedirectAt(Date.now() + 5000);
  }, [accessConfirmed, sessionId]);

  useEffect(() => {
    if (!accessConfirmed || redirectAt === null) return;
    if (secondsLeft <= 0) {
      navigate(DASHBOARD, { replace: true });
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft(Math.max(0, Math.ceil((redirectAt - Date.now()) / 1000))), 1000);
    return () => window.clearTimeout(timer);
  }, [accessConfirmed, redirectAt, secondsLeft, navigate]);

  const verifying = Boolean(sessionId && !result && (authLoading || isFetching));
  const title = result
    ? accessPending && result !== 'paid'
      ? (result === 'trial' ? 'subscription.trialVerifiedTitle' : 'subscription.checkoutVerifiedTitle')
      : RESULT_COPY[result][0]
    : sessionId ? 'subscription.verificationPendingTitle' : 'subscription.missingSessionTitle';
  const description = result
    ? (accessPending ? 'subscription.checkoutVerifiedPlan' : RESULT_COPY[result][1])
    : sessionId ? 'subscription.verificationPendingDescription' : 'subscription.missingSessionDescription';

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      <header className="hairline px-6 sm:px-10 py-4 font-serif text-lg text-deep-charcoal">
        seatable<span className="text-burgundy">.</span>
      </header>
      <main className="flex-1 grid place-items-center p-6">
        <div className="w-full max-w-[480px] text-center">
          {verifying ? (
            <div role="status">
              <Spinner size="lg" className="mx-auto mb-4" />
              <p className="text-[15px] text-warm-stone">{t('subscription.verifying')}</p>
            </div>
          ) : (
            <>
              {result && <ThiingsIcon name="check-circle" pxSize={36} className="mx-auto mb-4 text-emerald-600" />}
              <h1 className="font-serif text-3xl text-deep-charcoal mb-2">{t(title)}</h1>
              <p className="text-sm text-warm-stone mb-6">
                {t(description, { plan: plan ? t(`landing.pricing.${plan}.name`) : '' })}
              </p>

              {accessPending && (
                <p role="status" className="mb-5 text-sm text-amber-800">
                  {t('subscription.accessPending')}
                </p>
              )}

              {accessConfirmed && redirectAt !== null && (
                <>
                  <p className="text-sm text-warm-stone mb-2">
                    {t('subscription.redirectingIn', { seconds: secondsLeft })}
                  </p>
                  <button type="button" onClick={() => setRedirectAt(null)}
                    className="text-sm text-burgundy underline underline-offset-2 mb-5">
                    {t('subscription.stayHere')}
                  </button>
                </>
              )}

              <div className="flex flex-wrap justify-center gap-3">
                {sessionId && !accessConfirmed && (
                  userId ? (
                    <button type="button" onClick={() => void refetch()} disabled={isFetching}
                      className="min-h-11 px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full disabled:opacity-60">
                      {t('subscription.checkAgain')}
                    </button>
                  ) : (
                    <Link to="/login" state={{ from: location }}
                      className="min-h-11 px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full">
                      {t('login.signIn')}
                    </Link>
                  )
                )}
                {!accessPending && (
                  <Link to={sessionId ? DASHBOARD : '/subscription/manage'}
                    className="min-h-11 px-6 py-2.5 border border-border-gray text-deep-charcoal text-sm font-semibold rounded-full hover:border-muted-stone">
                    {t(sessionId ? 'subscription.goToDashboard' : 'subscription.title')}
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
