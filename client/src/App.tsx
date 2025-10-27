import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import LandingPage from './landing/pages/LandingPage';
import HostDashboard from './pages/HostDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import ObservabilityDashboard from './pages/ObservabilityDashboard';
import WaitlistPage from './pages/WaitlistPage';
import CustomerPortal from './pages/CustomerPortal';

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
            <Route path="/host-dashboard" element={<HostDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/observability" element={<ObservabilityDashboard />} />
            <Route path="/waitlist" element={<WaitlistPage />} />
            <Route path="/customer" element={<CustomerPortal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
