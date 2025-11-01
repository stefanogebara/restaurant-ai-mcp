import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import LandingPage from './landing/pages/LandingPage';
import LiveAIDemo from './pages/LiveAIDemo';
import HostDashboard from './pages/HostDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
// Observability moved to admin-only access (not for restaurant users)
// import ObservabilityDashboard from './pages/ObservabilityDashboard';
// Waitlist page removed - feature integrated into Host Dashboard sidebar
// import WaitlistPage from './pages/WaitlistPage';
import CustomerPortal from './pages/CustomerPortal';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import SubscriptionManage from './pages/SubscriptionManage';
import Onboarding from './pages/Onboarding';

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
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/live-demo" element={<LiveAIDemo />} />
            <Route path="/host-dashboard" element={<HostDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            {/* Observability removed - developer-only metrics, not for restaurant users */}
            {/* <Route path="/observability" element={<ObservabilityDashboard />} /> */}
            {/* Waitlist page removed - feature fully integrated into Host Dashboard sidebar */}
            {/* <Route path="/waitlist" element={<WaitlistPage />} /> */}
            <Route path="/customer" element={<CustomerPortal />} />
            <Route path="/subscription/success" element={<SubscriptionSuccess />} />
            <Route path="/subscription/manage" element={<SubscriptionManage />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
