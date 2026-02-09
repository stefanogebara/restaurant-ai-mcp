import axios from 'axios';
import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authentication interceptor to include Supabase session token
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (error) {
    console.error('Error getting auth session:', error);
  }
  return config;
});

/**
 * Authenticated fetch wrapper - use instead of raw fetch() for API calls.
 * Automatically attaches the Supabase session token as Bearer auth.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
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

  completeService: (serviceRecordId: string) =>
    api.post('/host-dashboard?action=complete-service', { service_record_id: serviceRecordId }),

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
  updateTablePosition: (tableId: string, position_x: number, position_y: number) =>
    api.post('/host-dashboard?action=update-table-position', { table_id: tableId, position_x, position_y }),

  updateTableProperties: (data: {
    table_id: string;
    shape?: string;
    capacity?: number;
    is_joinable?: boolean;
    is_fixed_seating?: boolean;
  }) => api.post('/host-dashboard?action=update-table-properties', data),

  linkTables: (tableId: string, linkWithId: string) =>
    api.post('/host-dashboard?action=link-tables', { table_id: tableId, link_with_id: linkWithId }),

  unlinkTables: (tableId: string, unlinkFromId: string) =>
    api.post('/host-dashboard?action=unlink-tables', { table_id: tableId, unlink_from_id: unlinkFromId }),

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
    [key: string]: any;
  }>) => api.post('/table-config?action=bulk-update', { updates }),
};
