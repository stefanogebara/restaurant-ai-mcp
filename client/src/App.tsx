import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ThiingsIcon from './components/common/ThiingsIcon';
import "./i18n/config";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';

const SentryBrowserRouter = Sentry.withSentryReactRouterV6Routing(BrowserRouter);
import { ToastProvider } from './contexts/ToastContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AuthProvider } from './contexts/AuthContext';

// Static imports (needed immediately or very small)
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';

// Lazy-loaded pages
const LandingPage = lazy(() => import('./landing/pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const LiveAIDemo = lazy(() => import('./pages/LiveAIDemo'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const WeeklyReport = lazy(() => import('./pages/WeeklyReport'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const CallTrackingDashboard = lazy(() => import('./pages/CallTrackingDashboard'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const SubscriptionSuccess = lazy(() => import('./pages/SubscriptionSuccess'));
const SubscriptionManage = lazy(() => import('./pages/SubscriptionManage'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const LanguageSettings = lazy(() => import('./pages/LanguageSettings'));
const TableConfigPage = lazy(() => import('./pages/TableConfigPage'));
const VoiceSettingsPage = lazy(() => import('./pages/VoiceSettingsPage'));
const WhatsAppSettingsPage = lazy(() => import('./pages/WhatsAppSettingsPage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const BookingConfirmation = lazy(() => import('./pages/BookingConfirmation'));
const FloorPlanEditor = lazy(() => import('./pages/FloorPlanEditor'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const DemoSetupPage = lazy(() => import('./pages/DemoSetupPage'));
const DemoDashboard = lazy(() => import('./pages/DemoDashboard'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteErrorFallback() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6">
      <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center shadow-sm">
        <div className="w-14 h-14 bg-amber-600/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <ThiingsIcon name="alert-triangle" pxSize={28} className="text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-deep-charcoal mb-2">This page encountered an error</h3>
        <p className="text-sm text-stone-gray mb-4">
          Something went wrong loading this page. Other parts of the app should still work.
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="/host-dashboard/simple"
            className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Go to Dashboard
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-soft-gray hover:bg-border-gray text-deep-charcoal font-semibold rounded-xl transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <SidebarProvider>
            <SentryBrowserRouter>
            <ErrorBoundary>
            <Suspense fallback={
              <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
                <div className="font-serif text-2xl text-deep-charcoal opacity-50">
                  seatable<span className="text-burgundy">.</span>
                </div>
                <div role="status" aria-label="Loading application" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy"></div>
              </div>
            }>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/live-demo" element={<LiveAIDemo />} />
              <Route path="/demo/setup" element={<DemoSetupPage />} />
              <Route path="/demo" element={<DemoDashboard />} />
              <Route path="/demo/:token" element={<DemoDashboard />} />
{/* Dashboard - New unified dashboard (default) */}
              <Route path="/host-dashboard" element={<Navigate to="/host-dashboard/simple" replace />} />
              <Route path="/host-dashboard/simple" element={<ErrorBoundary fallback={<RouteErrorFallback />}><Dashboard /></ErrorBoundary>} />
              <Route path="/host-dashboard/reports" element={<WeeklyReport />} />
              <Route path="/host-dashboard/calls" element={<CallTrackingDashboard />} />
              <Route path="/host-dashboard/tables" element={<TableConfigPage />} />
              <Route path="/host-dashboard/floor-plan" element={<FloorPlanEditor />} />
              <Route path="/host-dashboard/voice-settings" element={<VoiceSettingsPage />} />
              <Route path="/host-dashboard/whatsapp" element={<WhatsAppSettingsPage />} />
              <Route path="/host-dashboard/insights" element={<ErrorBoundary fallback={<RouteErrorFallback />}><AIInsights /></ErrorBoundary>} />
              <Route path="/analytics" element={<ErrorBoundary fallback={<RouteErrorFallback />}><AnalyticsDashboard /></ErrorBoundary>} />
              <Route path="/customer" element={<CustomerPortal />} />
              <Route path="/subscription/success" element={<SubscriptionSuccess />} />
              <Route path="/subscription/manage" element={<ErrorBoundary fallback={<RouteErrorFallback />}><SubscriptionManage /></ErrorBoundary>} />
              <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><Onboarding /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/settings/language" element={<LanguageSettings />} />
              {/* Public booking portal */}
              <Route path="/book/:slug" element={<ErrorBoundary fallback={<RouteErrorFallback />}><BookingPage /></ErrorBoundary>} />
              <Route path="/book/:slug/confirmed" element={<BookingConfirmation />} />
              {/* Team invite acceptance — public (token validates itself) */}
              <Route path="/join" element={<JoinPage />} />
              {/* Team management — protected */}
              <Route path="/host-dashboard/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </SentryBrowserRouter>
          </SidebarProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
