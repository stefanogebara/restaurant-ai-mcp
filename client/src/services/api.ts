import axios from 'axios';
import { supabase, authReady, isAuthInitialized } from '../lib/supabase';
import reservationContract from '../../../shared/reservation-contract.js';
import type { ReservationCreateInput, ReservationModifyInput } from '../../../shared/reservation-contract.js';
import type { TableShape } from '../types/host.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const { normalizeReservationCreateInput, normalizeReservationModifyInput } = reservationContract;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authentication interceptor to include Supabase session token.
// Wait for auth initialization before attaching the token to avoid sending
// stale/missing tokens during the INITIAL_SESSION resolution (C-03 fix).
api.interceptors.request.use(async (config) => {
  try {
    await authReady;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (error) {
    console.error('Error getting auth session:', error);
  }
  return config;
});

// Redirect to /login on 401 responses — catches expired sessions that
// slipped past the auth state listener (C-05 fix).
// Skips redirect if auth hasn't initialized yet (prevents race on page load, C-03 fix).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Don't redirect during auth initialization — the token may not be ready yet (C-03)
      if (!isAuthInitialized) {
        return Promise.reject(error);
      }
      // Only redirect if user is on a protected page (not public booking pages)
      const path = window.location.pathname;
      const isProtectedPage = path.startsWith('/host-dashboard') ||
        path.startsWith('/analytics') ||
        path.startsWith('/onboarding') ||
        path.startsWith('/welcome') ||
        path.startsWith('/subscription/manage') ||
        path.startsWith('/settings');
      if (isProtectedPage) {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore sign-out errors
        }
        window.location.replace('/login');
        return new Promise(() => {}); // Prevent further error handling during redirect
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Authenticated fetch wrapper - use instead of raw fetch() for API calls.
 * Automatically attaches the Supabase session token as Bearer auth.
 *
 * Waits for `authReady` (INITIAL_SESSION) before reading the session so calls
 * made on first mount (e.g. /subscription/success after a Stripe redirect)
 * don't race and ship without an Authorization header → 401.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    await authReady;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${session.access_token}`);
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }
      options.headers = headers;
    }
  } catch (error) {
    console.error('Error getting auth session for fetch:', error);
  }
  return fetch(url, options);
}

// Dashboard API
export const hostAPI = {
  getDashboard: () => api.get('/host-dashboard?action=dashboard'),

  checkIn: (reservationId: string) =>
    api.post('/host-dashboard?action=check-in', { reservation_id: reservationId }),

  checkWalkIn: (partySize: number, preferredLocation?: string) =>
    api.post('/host-dashboard?action=check-walk-in', {
      party_size: partySize,
      preferred_location: preferredLocation
    }),

  seatParty: (data: {
    type: 'reservation' | 'walk-in';
    reservation_id?: string;
    customer_name: string;
    customer_phone: string;
    party_size: number;
    table_ids: string[];
    special_requests?: string;
  }) => api.post('/host-dashboard?action=seat-party', data),

  completeService: (serviceRecordId: string, totalBill?: number) =>
    api.post('/host-dashboard?action=complete-service', {
      service_record_id: serviceRecordId,
      ...(totalBill !== undefined ? { total_bill: totalBill } : {}),
    }),

  markTableClean: (tableId: string) =>
    api.post('/host-dashboard?action=mark-table-clean', { table_id: tableId }),

  updateTableStatus: (tableId: string, status: 'Available' | 'Occupied' | 'Being Cleaned' | 'Reserved') =>
    api.post('/host-dashboard?action=update-table-status', { table_id: tableId, status }),

  updateReservation: (data: {
    reservation_id: string;
    dietary_restrictions?: string[];
    language_preference?: string;
    seating_preference?: string;
    special_occasion?: string;
    customer_type?: string;
    accessibility_needs?: string;
    internal_notes?: string;
    first_time_visitor?: boolean;
  }) => api.post('/host-dashboard?action=update-reservation', data),

  autoAssignShapes: () =>
    api.post('/host-dashboard?action=auto-assign-shapes', {}),

  // Floor Plan Editor methods
  updateTablePosition: (tableId: string, position_x: number, position_y: number, width?: number, height?: number, rotation?: number) =>
    api.post('/host-dashboard?action=update-table-position', {
      table_id: tableId, position_x, position_y,
      ...(width !== undefined && { width }),
      ...(height !== undefined && { height }),
      ...(rotation !== undefined && { rotation }),
    }),

  updateTableProperties: (data: {
    table_id: string;
    shape?: string;
    capacity?: number;
    is_joinable?: boolean;
    is_fixed_seating?: boolean;
  }) => api.post('/host-dashboard?action=update-table-properties', data),

  linkTables: (tableId: string, linkWithId: string) =>
    api.post('/host-dashboard?action=link-tables', { table_id: tableId, linked_table_id: linkWithId }),

  unlinkTables: (tableId: string, unlinkFromId: string) =>
    api.post('/host-dashboard?action=unlink-tables', { table_id: tableId, linked_table_id: unlinkFromId }),

  deleteTable: (tableId: string) =>
    api.post('/host-dashboard?action=delete-table', { table_id: tableId }),

  createTable: (data: {
    table_number: number;
    capacity: number;
    shape: string;
    position_x: number;
    position_y: number;
    location?: string;
  }) => api.post('/host-dashboard?action=create-table', data),

  getTableSuggestion: (partySize: number) =>
    api.get(`/table-suggestion?party_size=${partySize}`),

  // Reservation management (host creates/modifies/cancels from dashboard)
  createReservation: (data: ReservationCreateInput) =>
    api.post('/reservations?action=create', normalizeReservationCreateInput(data)),

  modifyReservation: (data: ReservationModifyInput) =>
    api.post('/reservations?action=modify', normalizeReservationModifyInput(data)),

  cancelReservation: (data: {
    reservation_id: string;
    reason?: string;
  }) => api.post('/host-dashboard?action=cancel-reservation', data),
};

// Table Configuration API

export interface TableConfig {
  id: string;
  table_number: number;
  capacity: number;
  location: string;
  status: string;
  is_active: boolean;
  is_fixed: boolean;
  min_capacity: number;
  max_capacity: number | null;
  adjacent_tables: string[];
  combination_group: string | null;
  // Forma e posição no salão. O endpoint (getAllTablesAdmin) SEMPRE devolveu
  // estes campos — só o tipo aqui não os declarava, então a página de Mesas
  // não tinha como desenhar a planta com os dados que já recebia.
  shape?: TableShape;
  is_fixed_seating?: boolean;
  is_joinable?: boolean;
  joinable_with?: string[];
  position_x?: number;
  position_y?: number;
  width?: number | null;
  height?: number | null;
  rotation?: number;
}

export const tableConfigAPI = {
  // Get all tables with full config
  listTables: () => api.get('/table-config?action=list'),

  // Get single table
  getTable: (tableId: string) => api.get(`/table-config?action=get&table_id=${tableId}`),

  // Create a new table
  createTable: (data: {
    table_number: number;
    capacity: number;
    location?: string;
    is_fixed?: boolean;
    combination_group?: string;
    min_capacity?: number;
    max_capacity?: number;
  }) => api.post('/table-config?action=create', data),

  // Update table configuration
  updateTable: (data: {
    table_id: string;
    table_number?: number;
    capacity?: number;
    location?: string;
    is_fixed?: boolean;
    combination_group?: string;
    min_capacity?: number;
    max_capacity?: number;
    adjacent_tables?: string[];
  }) => api.put('/table-config?action=update', data),

  // Delete (deactivate) a table
  deleteTable: (tableId: string) =>
    api.delete('/table-config?action=delete', { data: { table_id: tableId } }),

  // Set adjacency relationships
  setAdjacency: (tableId: string, adjacentTableIds: string[]) =>
    api.post('/table-config?action=set-adjacency', {
      table_id: tableId,
      adjacent_table_ids: adjacentTableIds
    }),

  // Bulk update multiple tables
  bulkUpdate: (updates: Array<{
    table_id: string;
    [key: string]: unknown;
  }>) => api.post('/table-config?action=bulk-update', { updates }),
};
