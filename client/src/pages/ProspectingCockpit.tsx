import { Navigate } from 'react-router-dom';

/**
 * The prospecting cockpit graduated into the standalone Olímpia Ops console
 * (Phase 7), deliberately outside the restaurant product. This route only
 * survives so old links keep working.
 */
export default function ProspectingCockpit() {
  return <Navigate to="/olimpia" replace />;
}
