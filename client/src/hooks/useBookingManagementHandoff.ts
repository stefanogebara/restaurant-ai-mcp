import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { readBookingManagementHandoff } from '../lib/bookingManagementHandoff';

export function useBookingManagementHandoff(displayedReceiptId?: string | null) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [handoff] = useState(() => navigationType === 'PUSH'
    ? readBookingManagementHandoff(location.state, displayedReceiptId)
    : undefined);

  useEffect(() => {
    const state: unknown = location.state;
    if (!state || typeof state !== 'object' || !('customerPhone' in state || 'receiptId' in state)) return;
    const remaining = { ...state } as Record<string, unknown>;
    delete remaining.customerPhone;
    delete remaining.receiptId;
    // Consume even invalid proof. Preserve the receipt and router metadata;
    // only component-local state may retain the phone for this visit.
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      replace: true,
      state: remaining,
    });
  }, [location.state, location.pathname, location.search, location.hash, navigate]);

  return handoff;
}
