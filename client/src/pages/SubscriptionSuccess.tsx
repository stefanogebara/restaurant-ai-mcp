import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useTranslation } from 'react-i18next';
import Spinner from '../components/common/Spinner';
import { useVerifySession } from '../hooks/useVerifySession';
import { LS_STRIPE_CUSTOMER_ID, LS_SUBSCRIPTION_PLAN, LS_CUSTOMER_EMAIL } from '../config/localStorageKeys';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const { data, isLoading } = useVerifySession(sessionId);

  const plan = data?.plan || 'Growth';
  const customerEmail = data?.customer_email || '';

  // Side effects: persist to localStorage + redirect after success
  useEffect(() => {
    if (!data) return;
    if (data.customer_id) localStorage.setItem(LS_STRIPE_CUSTOMER_ID, data.customer_id);
    if (data.plan) localStorage.setItem(LS_SUBSCRIPTION_PLAN, data.plan);
    if (data.customer_email) {
      localStorage.setItem(LS_CUSTOMER_EMAIL, data.customer_email);
      const timer = setTimeout(() => {
        navigate(`/onboarding?email=${encodeURIComponent(data.customer_email!)}&plan=${encodeURIComponent(data.plan || 'Growth')}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [data, navigate]);

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
            <div className="w-16 h-16 rounded-full bg-green-600/[8%] flex items-center justify-center mx-auto mb-5">
              <ThiingsIcon name="check" pxSize={28} className="text-green-600" />
            </div>

            <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">{t('subscription.welcomeTo', { plan })}</h1>
            <p className="text-sm text-warm-stone font-light mb-6">
              {t('subscription.upgradeActive')}
            </p>

            {customerEmail && (
              <p className="text-[13px] text-green-600 font-medium mb-6">
                {t('subscription.redirecting')}
              </p>
            )}

            <button
              onClick={() => navigate('/host-dashboard/simple')}
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
