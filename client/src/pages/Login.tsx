/**
 * Login Page
 * Email/password + Google OAuth sign-in for restaurant onboarding
 * Split-screen design with branded left panel
 */

import { useState, useEffect } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LS_PENDING_DEMO_TOKEN } from '../config/localStorageKeys';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { motion } from 'framer-motion';
import { trackSignupStarted } from '../lib/analytics';
import { useTranslation } from 'react-i18next';
import LoginBrandPanel from '../components/auth/LoginBrandPanel';

type AuthMode = 'signin' | 'signup';

export default function Login() {
  const { t } = useTranslation();
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>('signin');

  // Email/password form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Persist demo token to localStorage so it survives OAuth redirects and
  // email/password sign-in (which doesn't go through signInWithGoogle's redirectTo)
  useEffect(() => {
    const from = searchParams.get('from');
    const token = searchParams.get('token');
    if (from === 'demo' && token) {
      localStorage.setItem(LS_PENDING_DEMO_TOKEN, token);
    }
  }, [searchParams]);

  // Redirect if already logged in
  if (!loading && user) {
    return <Navigate to="/welcome" replace />;
  }

  // While auth is resolving (e.g. returning from OAuth callback), show spinner
  if (loading) {
    return (
      <div role="status" aria-label="Loading" className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div aria-hidden="true" className="font-serif text-2xl text-deep-charcoal opacity-50">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
      </div>
    );
  }

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);
    if (mode === 'signup') trackSignupStarted({ method: 'google' });

    // Preserve demo params through OAuth round-trip so Welcome.tsx can convert
    const extraRedirectParams: Record<string, string> = {};
    const fromParam = searchParams.get('from');
    const tokenParam = searchParams.get('token');
    if (fromParam) extraRedirectParams['from'] = fromParam;
    if (tokenParam) extraRedirectParams['token'] = tokenParam;

    try {
      await signInWithGoogle(Object.keys(extraRedirectParams).length > 0 ? extraRedirectParams : undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
      setIsSigningIn(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        trackSignupStarted({ method: 'email' });
        const { needsConfirmation } = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          setSuccessMessage('Check your email for a confirmation link to complete your registration.');
          setIsSigningIn(false);
          return;
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${mode === 'signin' ? 'sign in' : 'create account'}`);
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand + Features (hidden on mobile) */}
      <LoginBrandPanel />

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 bg-warm-white flex items-center justify-center px-6 py-12 relative">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="fixed lg:absolute top-6 left-6"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-stone-gray hover:text-deep-charcoal transition-colors text-sm"
          >
            <ThiingsIcon name="arrow-left" size="xs" />
            {t('login.backToHome')}
          </Link>
        </motion.div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white border border-border-gray rounded-[2rem] p-10 shadow-xl">
            {/* Logo and Title */}
            <div className="text-center mb-8">
              <Link to="/" className="inline-block mb-6 lg:hidden">
                <span className="font-serif text-3xl tracking-tight text-deep-charcoal">
                  seatable<span className="text-burgundy">.</span>
                </span>
              </Link>
              <h1 className="font-serif text-2xl text-deep-charcoal mb-2">
                {mode === 'signin' ? t('login.welcomeBack') : t('login.createAccount')}
              </h1>
              <p className="text-stone-gray font-light">
                {mode === 'signin' ? t('login.signInSubtitle') : t('login.signUpSubtitle')}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Success Message */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-700 text-sm"
              >
                {successMessage}
              </motion.div>
            )}

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className={`
                w-full flex items-center justify-center gap-3 px-6 py-4
                bg-white border border-border-gray hover:border-stone-300 hover:bg-warm-white
                text-deep-charcoal font-medium text-[15px] rounded-xl
                transition-all duration-300
                ${isSigningIn ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-md'}
              `}
            >
              {isSigningIn && !email ? (
                <div aria-hidden="true" className="animate-spin rounded-full h-5 w-5 border-2 border-deep-charcoal border-t-transparent"></div>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              <span>{t('login.continueWithGoogle')}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-border-gray"></div>
              <span className="text-xs text-muted-stone uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border-gray"></div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-[13px] font-medium text-stone-gray mb-1.5">
                  {t('login.emailAddress')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  required
                  className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm text-deep-charcoal placeholder-stone-300 focus:outline-none focus:ring-[3px] focus:ring-burgundy/[6%] focus:border-burgundy transition-all"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-[13px] font-medium text-stone-gray mb-1.5">
                  {t('login.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? t('login.passwordMinChars') : t('login.yourPassword')}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm text-deep-charcoal placeholder-stone-300 focus:outline-none focus:ring-[3px] focus:ring-burgundy/[6%] focus:border-burgundy transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className={`
                  w-full flex items-center justify-center gap-3 px-6 py-3.5
                  bg-burgundy hover:bg-burgundy-dark
                  text-white font-semibold text-[15px] rounded-full
                  transition-all duration-200
                  ${isSigningIn ? 'opacity-70 cursor-not-allowed' : ''}
                `}
              >
                {isSigningIn && email ? (
                  <div aria-hidden="true" className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                ) : null}
                <span>{mode === 'signin' ? t('login.signIn') : t('login.createAccountBtn')}</span>
              </button>
            </form>

            {/* Toggle sign-in / sign-up */}
            <div className="text-center mt-6">
              {mode === 'signin' ? (
                <p className="text-stone-gray text-sm">
                  {t('login.newToSeatable')}{' '}
                  <button
                    onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                    className="text-burgundy font-semibold hover:underline"
                  >
                    {t('login.createAnAccount')}
                  </button>
                </p>
              ) : (
                <p className="text-stone-gray text-sm">
                  {t('login.alreadyHaveAccount')}{' '}
                  <button
                    onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
                    className="text-burgundy font-semibold hover:underline"
                  >
                    {t('login.signIn')}
                  </button>
                </p>
              )}
            </div>

            {/* Terms */}
            <p className="mt-6 text-center text-xs text-muted-stone font-light">
              By continuing, you agree to our{' '}
              <a href="/terms" className="text-burgundy hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-burgundy hover:underline">
                Privacy Policy
              </a>
            </p>
          </div>

          {/* Trust Indicators - Mobile only (desktop has left panel) */}
          <div className="mt-8 flex justify-center gap-8 text-center lg:hidden">
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">2.3s</div>
              <div className="text-xs text-stone-gray uppercase tracking-wider">Avg Response</div>
            </div>
            <div className="w-px bg-border-gray"></div>
            <div>
              <div className="text-xl font-serif font-bold text-burgundy">6+</div>
              <div className="text-xs text-stone-gray uppercase tracking-wider">Languages</div>
            </div>
            <div className="w-px bg-border-gray"></div>
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">24/7</div>
              <div className="text-xs text-stone-gray uppercase tracking-wider">AI Booking</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
