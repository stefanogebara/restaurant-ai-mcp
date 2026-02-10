import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import "./i18n/config";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AuthProvider } from './contexts/AuthContext';

// Static imports (needed immediately or very small)
import LandingPage from './landing/pages/LandingPage';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';

// Lazy-loaded pages
const LiveAIDemo = lazy(() => import('./pages/LiveAIDemo'));
const SimpleDashboard = lazy(() => import('./pages/SimpleDashboard'));
const HostDashboard = lazy(() => import('./pages/HostDashboard'));
const WeeklyReport = lazy(() => import('./pages/WeeklyReport'));
const MLPerformancePage = lazy(() => import('./pages/MLPerformancePage'));
const CustomerLTVPage = lazy(() => import('./pages/CustomerLTVPage'));
const CustomerDNAPage = lazy(() => import('./pages/CustomerDNAPage'));
const CustomerDNAProfilePage = lazy(() => import('./pages/CustomerDNAProfilePage'));
const SegoviaInsightsPage = lazy(() => import('./pages/SegoviaInsightsPage'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const CallTrackingDashboard = lazy(() => import('./pages/CallTrackingDashboard'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const SubscriptionSuccess = lazy(() => import('./pages/SubscriptionSuccess'));
const SubscriptionManage = lazy(() => import('./pages/SubscriptionManage'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const LanguageSettings = lazy(() => import('./pages/LanguageSettings'));
const TestPhoneInput = lazy(() => import('./pages/TestPhoneInput'));
const TableConfigPage = lazy(() => import('./pages/TableConfigPage'));
const FloorPlanEditor = lazy(() => import('./pages/FloorPlanEditor'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <SidebarProvider>
            <BrowserRouter>
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
              {/* Simple Dashboard - Default for new users (English default, switchable) */}
              <Route path="/host-dashboard" element={<Navigate to="/host-dashboard/simple" replace />} />
              <Route path="/host-dashboard/simple" element={<SimpleDashboard />} />
              {/* Advanced Dashboard - All features for power users */}
              <Route path="/host-dashboard/advanced" element={<HostDashboard />} />
              <Route path="/host-dashboard/reports" element={<WeeklyReport />} />
              <Route path="/host-dashboard/ml" element={<MLPerformancePage />} />
              <Route path="/host-dashboard/ltv" element={<CustomerLTVPage />} />
              <Route path="/host-dashboard/dna" element={<CustomerDNAPage />} />
              <Route path="/host-dashboard/dna/:customerId" element={<CustomerDNAProfilePage />} />
              <Route path="/host-dashboard/segovia" element={<SegoviaInsightsPage />} />
              <Route path="/host-dashboard/calls" element={<CallTrackingDashboard />} />
              <Route path="/host-dashboard/tables" element={<TableConfigPage />} />
              <Route path="/host-dashboard/floor-plan" element={<FloorPlanEditor />} />
              <Route path="/analytics" element={<AnalyticsDashboard />} />
              <Route path="/customer" element={<CustomerPortal />} />
              <Route path="/subscription/success" element={<SubscriptionSuccess />} />
              <Route path="/subscription/manage" element={<SubscriptionManage />} />
              <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/settings/language" element={<LanguageSettings />} />
              <Route path="/test-phone-input" element={<TestPhoneInput />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </SidebarProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
