import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import "./i18n/config";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AuthProvider } from './contexts/AuthContext';
import LandingPage from './landing/pages/LandingPage';
import LiveAIDemo from './pages/LiveAIDemo';
import SimpleDashboard from './pages/SimpleDashboard';
import HostDashboard from './pages/HostDashboard';
import WeeklyReport from './pages/WeeklyReport';
import MLPerformancePage from './pages/MLPerformancePage';
import CustomerLTVPage from './pages/CustomerLTVPage';
import CustomerDNAPage from './pages/CustomerDNAPage';
import SegoviaInsightsPage from './pages/SegoviaInsightsPage';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CallTrackingDashboard from './pages/CallTrackingDashboard';
import CustomerPortal from './pages/CustomerPortal';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import SubscriptionManage from './pages/SubscriptionManage';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import LanguageSettings from './pages/LanguageSettings';
import TestPhoneInput from './pages/TestPhoneInput';
import ProtectedRoute from './components/ProtectedRoute';

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
              <Route path="/host-dashboard/segovia" element={<SegoviaInsightsPage />} />
              <Route path="/host-dashboard/calls" element={<CallTrackingDashboard />} />
              <Route path="/analytics" element={<AnalyticsDashboard />} />
              <Route path="/customer" element={<CustomerPortal />} />
              <Route path="/subscription/success" element={<SubscriptionSuccess />} />
              <Route path="/subscription/manage" element={<SubscriptionManage />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/settings/language" element={<LanguageSettings />} />
              <Route path="/test-phone-input" element={<TestPhoneInput />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </SidebarProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
