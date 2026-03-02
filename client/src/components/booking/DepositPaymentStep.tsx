import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface DepositPaymentStepProps {
  clientSecret: string;
  depositAmount: number;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}

function DepositForm({ depositAmount, onSuccess, onCancel }: Omit<DepositPaymentStepProps, 'clientSecret'>) {
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
      setError(confirmError.message || 'Payment failed');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'requires_capture') {
      onSuccess(paymentIntent.id);
    } else {
      setError('Unexpected payment status. Please try again.');
      setIsProcessing(false);
    }
  };

  const formatted = new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: 'EUR',
  }).format(depositAmount);

  return (
    <div className="space-y-5">
      <div className="bg-violet-600/[6%] border border-violet-600/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/[10%] flex items-center justify-center text-violet-600 text-lg">
            💳
          </div>
          <div>
            <p className="text-sm font-semibold text-deep-charcoal">Reservation Deposit</p>
            <p className="text-xs text-warm-stone">
              A hold of {formatted} will be placed on your card. It will be released when you arrive.
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
        <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 py-3.5 border border-border-gray bg-white text-stone-gray font-medium rounded-xl text-sm hover:border-muted-stone transition-colors disabled:opacity-50"
        >
          Back
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
              Processing...
            </>
          ) : (
            `Confirm & Hold ${formatted}`
          )}
        </button>
      </div>
    </div>
  );
}

export default function DepositPaymentStep({ clientSecret, depositAmount, onSuccess, onCancel }: DepositPaymentStepProps) {
  if (!clientSecret) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
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
