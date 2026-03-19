/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 * Modern Elegant Design
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div role="status" className="text-center">
          <div aria-hidden="true" className="animate-spin rounded-full h-10 w-10 border-2 border-burgundy border-t-transparent mx-auto mb-4"></div>
          <p className="text-stone-gray font-light text-sm">{t('common.loadingText')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login, saving the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
