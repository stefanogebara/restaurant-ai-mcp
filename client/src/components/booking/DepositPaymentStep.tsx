import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeElementLocale } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { formatCurrency } from '../../utils/currency';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
// Only initialise Stripe when a key is actually configured. loadStripe('')
// resolves to a broken instance that fails opaquely inside <Elements>.
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

interface DepositPaymentStepProps {
  clientSecret: string;
  depositAmount: number;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}

function DepositForm({ depositAmount, onSuccess, onCancel }: Omit<DepositPaymentStepProps, 'clientSecret'>) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || t('booking.deposit.paymentFailed'));
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'requires_capture') {
      onSuccess(paymentIntent.id);
    } else {
      setError(t('booking.deposit.unexpectedStatus'));
      setIsProcessing(false);
    }
  };

  const formatted = formatCurrency(depositAmount);

  return (
    <div className="space-y-5">
      <div className="bg-violet-600/[6%] border border-violet-600/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/[10%] flex items-center justify-center text-violet-600 text-lg">
            ðŸ’³
          </div>
          <div>
            <p className="text-sm font-semibold text-deep-charcoal">{t('booking.deposit.heading')}</p>
            <p className="text-xs text-warm-stone">
              {t('booking.deposit.holdNotice', { amount: formatted })}
            </p>
          </div>
        </div>
      </div>

      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {error && (
        // role="alert" + aria-live ensures screen readers announce
        // payment failures immediately. Without it, a blind user who
        // submitted a declined card would hear nothing â€” the visual
        // red banner is the only feedback the page currently provides.
        <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3" role="alert" aria-live="assertive">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 py-3.5 border border-glass-border-dark bg-white text-stone-gray font-medium rounded-xl text-sm hover:border-muted-stone transition-colors disabled:opacity-50"
        >
          {t('booking.deposit.back')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!stripe || !elements || isProcessing}
          className="flex-1 py-3.5 bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray disabled:text-muted-stone text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div aria-hidden="true" className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              {t('booking.deposit.processing')}
            </>
          ) : (
            t('booking.deposit.confirmAndHold', { amount: formatted })
          )}
        </button>
      </div>
    </div>
  );
}

export default function DepositPaymentStep({ clientSecret, depositAmount, onSuccess, onCancel }: DepositPaymentStepProps) {
  const { t, i18n } = useTranslation();

  if (!clientSecret) return null;

  // Stripe key missing at build time â€” surface a clear message instead of
  // rendering a silently-broken <Elements> tree.
  if (!stripePromise) {
    console.error('[DepositPaymentStep] VITE_STRIPE_PUBLISHABLE_KEY is unset â€” cannot render payment form');
    return (
      <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3">
        <p className="text-sm text-red-600">{t('booking.deposit.unavailable')}</p>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        // Localise Stripe's own field labels + validation errors.
        locale: i18n.language as StripeElementLocale,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#8B1A4A',
            borderRadius: '10px',
          },
        },
      }}
    >
      <DepositForm depositAmount={depositAmount} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
