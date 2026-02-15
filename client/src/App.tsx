import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import "./i18n/config";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
const CallTrackingDashboard = lazy(() => import('./pages/CallTrackingDashboard'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const SubscriptionSuccess = lazy(() => import('./pages/SubscriptionSuccess'));
const SubscriptionManage = lazy(() => import('./pages/SubscriptionManage'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const LanguageSettings = lazy(() => import('./pages/LanguageSettings'));
const TableConfigPage = lazy(() => import('./pages/TableConfigPage'));
const VoiceSettingsPage = lazy(() => import('./pages/VoiceSettingsPage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const BookingConfirmation = lazy(() => import('./pages/BookingConfirmation'));

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
      <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 max-w-md text-center shadow-sm">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-[#1C1917] mb-2">This page encountered an error</h3>
        <p className="text-sm text-[#57534E] mb-4">
          Something went wrong loading this page. Other parts of the app should still work.
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="/host-dashboard/simple"
            className="px-5 py-2.5 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Go to Dashboard
          </a>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-colors text-sm"
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
            <BrowserRouter>
            <ErrorBoundary>
            <Suspense fallback={
              <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center gap-4">
                <div className="font-serif text-2xl text-[#1C1917] opacity-50">
                  Seatable<span className="text-[#9F1239]">.</span>
                </div>
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E7E5E4] border-t-[#9F1239]"></div>
              </div>
            }>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/live-demo" element={<LiveAIDemo />} />
              {/* Dashboard - New unified dashboard (default) */}
              <Route path="/host-dashboard" element={<Navigate to="/host-dashboard/simple" replace />} />
              <Route path="/host-dashboard/simple" element={<ErrorBoundary fallback={<RouteErrorFallback />}><Dashboard /></ErrorBoundary>} />
              <Route path="/host-dashboard/reports" element={<WeeklyReport />} />
              <Route path="/host-dashboard/calls" element={<CallTrackingDashboard />} />
              <Route path="/host-dashboard/tables" element={<TableConfigPage />} />
              <Route path="/host-dashboard/voice-settings" element={<VoiceSettingsPage />} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
          </SidebarProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
