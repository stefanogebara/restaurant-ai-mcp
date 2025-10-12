import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HostDashboard from './pages/HostDashboard';

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
      <HostDashboard />
    </QueryClientProvider>
  );
}

export default App;
