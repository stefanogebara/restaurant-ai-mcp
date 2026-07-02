import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import ThiingsIcon from './components/common/ThiingsIcon';
import "./i18n/config";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';

// Use v7 wrapper to match react-router-dom v7.x (v6 wrapper caused auto-redirects)
const SentryBrowserRouter = Sentry.withSentryReactRouterV7Routing(BrowserRouter);
import { ToastProvider } from './contexts/ToastContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AuthProvider } from './contexts/AuthContext';

// Static imports (needed immediately or very small)
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';

// lazyRetry: wraps React.lazy with automatic retry on chunk load failures.
// After a new Vercel deploy, stale chunk hashes cause import failures for
// users with cached HTML (Meta in-app browsers, service worker, back-button).
// This retries twice before falling back to a full page reload.
import { lazyRetry } from './utils/lazyRetry';

// Lazy-loaded pages (with retry for chunk load resilience)
const LandingPage = lazyRetry(() => import('./landing/pages/LandingPage'));
const PricingPage = lazyRetry(() => import('./landing/pages/PricingPage'));
const SeoLandingPage = lazyRetry(() => import('./pages/SeoLandingPage'));
const NoShowCalculator = lazyRetry(() => import('./pages/NoShowCalculator'));
const Login = lazyRetry(() => import('./pages/Login'));
const LiveAIDemo = lazyRetry(() => import('./pages/LiveAIDemo'));
const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const DashboardV2 = lazyRetry(() => import('./pages/DashboardV2'));
const SettingsV2 = lazyRetry(() => import('./pages/SettingsV2'));
const SofiaV2 = lazyRetry(() => import('./pages/SofiaV2'));
const InsightsPage = lazyRetry(() => import('./pages/InsightsPage'));
const CallTrackingDashboard = lazyRetry(() => import('./pages/CallTrackingDashboard'));
const CustomerPortal = lazyRetry(() => import('./pages/CustomerPortal'));
const SubscriptionSuccess = lazyRetry(() => import('./pages/SubscriptionSuccess'));
const SubscriptionManage = lazyRetry(() => import('./pages/SubscriptionManage'));
const Welcome = lazyRetry(() => import('./pages/Welcome'));
const Onboarding = lazyRetry(() => import('./pages/Onboarding'));
const OnboardingChat = lazyRetry(() => import('./pages/OnboardingChat'));
const LanguageSettings = lazyRetry(() => import('./pages/LanguageSettings'));
const TableConfigPage = lazyRetry(() => import('./pages/TableConfigPage'));
const VoiceSettingsPage = lazyRetry(() => import('./pages/VoiceSettingsPage'));
const ProspectingCockpit = lazyRetry(() => import('./pages/ProspectingCockpit'));
const OlimpiaOps = lazyRetry(() => import('./pages/OlimpiaOps'));
const WhatsAppSettingsPage = lazyRetry(() => import('./pages/WhatsAppSettingsPage'));
const BookingPage = lazyRetry(() => import('./pages/BookingPage'));
const BookingConfirmation = lazyRetry(() => import('./pages/BookingConfirmation'));
const FloorPlanEditor = lazyRetry(() => import('./pages/FloorPlanEditor'));
const JoinPage = lazyRetry(() => import('./pages/JoinPage'));
const TeamPage = lazyRetry(() => import('./pages/TeamPage'));
const LTVPage = lazyRetry(() => import('./pages/LTVPage'));
const DemoSetupPage = lazyRetry(() => import('./pages/DemoSetupPage'));
const DemoConversation = lazyRetry(() => import('./pages/DemoConversation'));
const DemoDashboard = lazyRetry(() => import('./pages/DemoDashboard'));
const PrivacyPolicy = lazyRetry(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazyRetry(() => import('./pages/TermsOfService'));
// PortfolioPage removed — orphaned route, linked from nowhere
const RestaurantSettingsPage = lazyRetry(() => import('./pages/RestaurantSettingsPage'));
const ManagerAIChatPage = lazyRetry(() => import('./pages/ManagerAIChatPage'));
const CampaignsPage = lazyRetry(() => import('./pages/CampaignsPage'));
const CouponsPage = lazyRetry(() => import('./pages/CouponsPage'));
const EventsPage = lazyRetry(() => import('./pages/EventsPage'));
const EventBookingPage = lazyRetry(() => import('./pages/EventBookingPage'));
const CustomersPage = lazyRetry(() => import('./pages/CustomersPage'));
const IntegrationsPage = lazyRetry(() => import('./pages/IntegrationsPage'));
// Prototype removed — orphaned route, linked from nowhere

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteErrorFallback() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6">
      <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center">
        <div className="w-14 h-14 bg-amber-600/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <ThiingsIcon name="alert-triangle" pxSize={28} className="text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-deep-charcoal mb-2">{t('errors.pageError', 'Esta página encontrou um erro')}</h3>
        <p className="text-sm text-stone-gray mb-4">
          {t('errors.pageErrorDesc', 'Algo deu errado ao carregar esta página. Outras partes do app devem funcionar.')}
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="/host-dashboard/simple"
            className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {t('errors.goToDashboard', 'Ir para o Painel')}
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-soft-gray hover:bg-border-gray text-deep-charcoal font-semibold rounded-xl transition-colors text-sm"
          >
            {t('errors.retry', 'Tentar novamente')}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <SidebarProvider>
            <SentryBrowserRouter>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:text-deep-charcoal focus:shadow-md"
            >
              {t('common.skipToContent', 'Skip to content')}
            </a>
            <ErrorBoundary>
            <Suspense fallback={
              <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
                <div className="font-serif text-2xl text-deep-charcoal opacity-50">
                  seatable<span className="text-burgundy">.</span>
                </div>
                <div role="status" aria-label="Loading application" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy"></div>
              </div>
            }>
            <main id="main-content">
            <Routes>
              <Route path="/" element={<ErrorBoundary fallback={<RouteErrorFallback />}><LandingPage /></ErrorBoundary>} />
              {/* Dedicated pricing page — the grid moved off the landing
                  (2026-06). /pricing alias kept for EN ads/links. */}
              <Route path="/precos" element={<ErrorBoundary fallback={<RouteErrorFallback />}><PricingPage /></ErrorBoundary>} />
              <Route path="/pricing" element={<ErrorBoundary fallback={<RouteErrorFallback />}><PricingPage /></ErrorBoundary>} />
              <Route path="/login" element={<Login />} />
              <Route path="/live-demo" element={<LiveAIDemo />} />
              {/* /prototype route removed — orphaned, linked from nowhere */}
              <Route path="/demo/setup" element={<DemoSetupPage />} />
              <Route path="/demo/chat" element={<DemoConversation />} />
              <Route path="/demo" element={<DemoDashboard />} />
              <Route path="/demo/:token" element={<DemoDashboard />} />
{/* Dashboard - New unified dashboard (default) */}
              <Route path="/host-dashboard" element={<Navigate to="/host-dashboard/simple" replace />} />
              <Route path="/host-dashboard/simple" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><Dashboard /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/host-dashboard/v2" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><DashboardV2 /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/host-dashboard/settings/v2" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><SettingsV2 /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/host-dashboard/sofia/v2" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><SofiaV2 /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/host-dashboard/reports" element={<Navigate to="/host-dashboard/insights?tab=reports" replace />} />
              <Route path="/host-dashboard/calls" element={<ProtectedRoute><CallTrackingDashboard /></ProtectedRoute>} />
              <Route path="/host-dashboard/tables" element={<ProtectedRoute><TableConfigPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/floor-plan" element={<ProtectedRoute><FloorPlanEditor /></ProtectedRoute>} />
              <Route path="/host-dashboard/voice-settings" element={<ProtectedRoute><VoiceSettingsPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/whatsapp" element={<ProtectedRoute><WhatsAppSettingsPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/prospecting" element={<ProtectedRoute><ProspectingCockpit /></ProtectedRoute>} />
              <Route path="/olimpia" element={<ProtectedRoute><OlimpiaOps /></ProtectedRoute>} />
              <Route path="/host-dashboard/insights" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><InsightsPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/host-dashboard/ltv" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><LTVPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/analytics" element={<Navigate to="/host-dashboard/insights?tab=analytics" replace />} />
              <Route path="/customer" element={<CustomerPortal />} />
              <Route path="/subscription/success" element={<SubscriptionSuccess />} />
              <Route path="/subscription/manage" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><SubscriptionManage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><Onboarding /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/onboarding-chat" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><OnboardingChat /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/settings/language" element={<ProtectedRoute><LanguageSettings /></ProtectedRoute>} />
              <Route path="/settings/restaurant" element={<Navigate to="/host-dashboard/settings" replace />} />
              {/* Public booking portal */}
              <Route path="/book/:slug" element={<ErrorBoundary fallback={<RouteErrorFallback />}><BookingPage /></ErrorBoundary>} />
              <Route path="/book/:slug/confirmed" element={<BookingConfirmation />} />
              {/* Team invite acceptance — public (token validates itself) */}
              <Route path="/join" element={<JoinPage />} />
              {/* Team management — protected */}
              <Route path="/host-dashboard/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/settings" element={<ProtectedRoute><RestaurantSettingsPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/manager-ai" element={<ProtectedRoute><ManagerAIChatPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/coupons" element={<ProtectedRoute><ErrorBoundary fallback={<RouteErrorFallback />}><CouponsPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/host-dashboard/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
              {/* Public event booking page */}
              <Route path="/events/:slug/:eventId" element={<ErrorBoundary fallback={<RouteErrorFallback />}><EventBookingPage /></ErrorBoundary>} />
              <Route path="/host-dashboard/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
              <Route path="/host-dashboard/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              {/* /portfolio route removed — orphaned, linked from nowhere */}
              {/* Programmatic SEO pages — /para/:slug */}
              <Route path="/para/:slug" element={<ErrorBoundary fallback={<RouteErrorFallback />}><SeoLandingPage /></ErrorBoundary>} />
              <Route path="/calculadora" element={<ErrorBoundary fallback={<RouteErrorFallback />}><NoShowCalculator /></ErrorBoundary>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </main>
            </Suspense>
            </ErrorBoundary>
          </SentryBrowserRouter>
          </SidebarProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
