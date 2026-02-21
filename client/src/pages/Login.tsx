import { useTranslation } from 'react-i18next';
/**
 * Login Page
 * Email/password + Google OAuth sign-in for restaurant onboarding
 * Split-screen design with branded left panel
 */

import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { motion } from 'framer-motion';

type AuthMode = 'signin' | 'signup';

export default function Login() {
  const { t } = useTranslation();
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>('signin');

  // Email/password form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Redirect if already logged in
  if (!loading && user) {
    return <Navigate to="/welcome" replace />;
  }

  // While auth is resolving (e.g. returning from OAuth callback), show spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-deep-charcoal opacity-50">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" aria-label={t('common.loading')} />
      </div>
    );
  }

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);

    try {
      await signInWithGoogle();
    } catch (err) {
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
        const { needsConfirmation } = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          setSuccessMessage('Check your email for a confirmation link to complete your registration.');
          setIsSigningIn(false);
          return;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode === 'signin' ? 'sign in' : 'create account'}`);
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand + Features (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-[0_0_480px] bg-deep-charcoal relative overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-full h-full" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Decorative accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-burgundy/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-burgundy/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Link to="/" className="inline-block">
              <span className="font-serif text-3xl tracking-tight text-white">
                seatable<span className="text-burgundy">.</span>
              </span>
            </Link>
          </motion.div>

          {/* Main message */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-8"
          >
            <p className="font-serif text-4xl xl:text-[36px] font-normal italic leading-[1.35] tracking-tight text-soft-gray mb-10">
              &ldquo;An AI that truly <em className="text-burgundy">understands</em> your restaurant.&rdquo;
            </p>

            {/* Feature highlights */}
            <div className="space-y-5">
              {[
                { title: 'AI Voice Agent', desc: "Handles calls and reservations in your restaurant's unique voice and personality." },
                { title: 'Smart Dashboard', desc: 'Real-time reservations, walk-ins, and table management on one screen.' },
                { title: 'Guest Memory', desc: 'Every returning guest feels recognized with personalized experiences.' },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.15 }}
                  className="flex items-start gap-3.5"
                >
                  <div className="w-2 h-2 rounded-full bg-burgundy flex-shrink-0 mt-1.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-soft-gray mb-1">{feature.title}</h4>
                    <p className="text-[13px] text-warm-stone font-light leading-relaxed">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Bottom stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex gap-8"
          >
            <div>
              <div className="text-2xl font-serif font-bold text-white">2.3s</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">Avg Response</div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-2xl font-serif font-bold text-burgundy">6+</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">Languages</div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-2xl font-serif font-bold text-white">24/7</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">AI Booking</div>
            </div>
          </motion.div>
        </div>
      </div>

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
            Back to Home
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
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-stone-gray font-light">
                {mode === 'signin' ? 'Sign in to manage your restaurant' : 'Start your 14-day free trial'}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-[#dc2626]/10 border border-[#dc2626]/20 rounded-xl text-[#dc2626] text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Success Message */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl text-[#15803d] text-sm"
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
                bg-white border border-border-gray hover:border-[#D6D3D1] hover:bg-warm-white
                text-deep-charcoal font-medium text-[15px] rounded-xl
                transition-all duration-300
                ${isSigningIn ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-md'}
              `}
            >
              {isSigningIn && !email ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-deep-charcoal border-t-transparent"></div>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
              <span>Continue with Google</span>
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
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  required
                  className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm text-deep-charcoal placeholder-[#D6D3D1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)] focus:border-burgundy transition-all"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-[13px] font-medium text-stone-gray mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm text-deep-charcoal placeholder-[#D6D3D1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)] focus:border-burgundy transition-all"
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
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                ) : null}
                <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
              </button>
            </form>

            {/* Toggle sign-in / sign-up */}
            <div className="text-center mt-6">
              {mode === 'signin' ? (
                <p className="text-stone-gray text-sm">
                  New to seatable?{' '}
                  <button
                    onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                    className="text-burgundy font-semibold hover:underline"
                  >
                    Create an account
                  </button>
                </p>
              ) : (
                <p className="text-stone-gray text-sm">
                  Already have an account?{' '}
                  <button
                    onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
                    className="text-burgundy font-semibold hover:underline"
                  >
                    Sign in
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
