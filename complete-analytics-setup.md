# Analytics Dashboard - Complete Implementation Guide

## Files Created

### 1. Backend: api/analytics.js ✓ CREATED (7.3KB)
Analytics endpoint that calculates metrics from Airtable data.

### 2. Frontend: client/src/pages/AnalyticsDashboard.tsx (PENDING)
React component with visualizations and charts.

## Manual Installation Steps

Since file watchers are preventing automated file updates, please follow these steps:

### Step 1: Stop All Dev Servers
```bash
# Kill all node processes
taskkill //F //IM node.exe
```

### Step 2: Create Frontend Component

Open `client/src/pages/AnalyticsDashboard.tsx` in your editor and replace ALL content with the code from `FRONTEND-ANALYTICS-CODE.md` (creating that file next).

### Step 3: Install React Router
```bash
cd client
npm install react-router-dom --legacy-peer-deps
```

### Step 4: Update App.tsx for Routing

Replace `client/src/App.tsx` with:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import HostDashboard from './pages/HostDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/host-dashboard" replace />} />
            <Route path="/host-dashboard" element={<HostDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
```

### Step 5: Add Navigation Link to Host Dashboard

In `client/src/pages/HostDashboard.tsx`, add this button in the header section (around line 60):

```typescript
<a
  href="/analytics"
  className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/30"
>
  View Analytics
</a>
```

### Step 6: Test

```bash
npm run dev:full
```

Visit:
- Host Dashboard: http://localhost:5173/host-dashboard  
- Analytics: http://localhost:5173/analytics

### Step 7: Deploy to Production

```bash
git add .
git commit -m "Add analytics dashboard with comprehensive metrics and visualizations"
git push
```

Vercel will auto-deploy.

## Features Implemented

✓ Backend Analytics Endpoint (`/api/analytics`)
- Aggregates last 30 days of data
- Calculates 15+ metrics
- Real-time current occupancy
- Table utilization rates

✓ Frontend Dashboard
- 4 overview metric cards
- Current occupancy progress bar
- Daily trend chart (7 days)
- Reservations by status (pie chart)
- Reservations by day of week
- Reservations by time slot
- Table utilization table

