import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/common/Spinner';
import { authFetch } from '../services/api';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [plan, setPlan] = useState<string>('Growth');

  useEffect(() => {
    const verifySession = async () => {
      // Get session ID from URL parameters
      const params = new URLSearchParams(window.location.search);
      const id = params.get('session_id');

      if (!id) {
        setLoading(false);
        return;
      }

      try {
        // Verify session with backend
        const apiUrl = import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL}/api/verify-session`
          : '/api/verify-session';

        const response = await authFetch(`${apiUrl}?session_id=${id}`);

        if (response.ok) {
          const data = await response.json();

          // Store customer data in localStorage
          if (data.customer_id) {
            localStorage.setItem('stripe_customer_id', data.customer_id);
          }
          if (data.plan) {
            setPlan(data.plan);
            localStorage.setItem('subscription_plan', data.plan);
          }
          if (data.customer_email) {
            setCustomerEmail(data.customer_email);
            localStorage.setItem('customer_email', data.customer_email);

            // Check if onboarding is complete
            // For new customers, redirect to onboarding
            setTimeout(() => {
              navigate(`/onboarding?email=${encodeURIComponent(data.customer_email)}&plan=${encodeURIComponent(data.plan || 'Growth')}`);
            }, 3000); // Give user 3 seconds to see success message
          }
        }
      } catch (error) {
        console.error('Error verifying session:', error);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-[15px] text-warm-stone font-light">Verifying your subscription...</p>
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
            <div className="w-16 h-16 rounded-full bg-[rgba(22,163,74,0.08)] flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">Welcome to {plan}!</h1>
            <p className="text-sm text-warm-stone font-light mb-6">
              Your upgrade is active. You now have access to the AI Voice Agent and advanced analytics.
            </p>

            {customerEmail && (
              <p className="text-[13px] text-[#16a34a] font-medium mb-6">
                Redirecting to onboarding in 3 seconds...
              </p>
            )}

            <button
              onClick={() => navigate('/host-dashboard/simple')}
              className="px-7 py-3 bg-deep-charcoal hover:bg-charcoal-dark text-white text-sm font-semibold rounded-full transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
