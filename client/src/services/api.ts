import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
};
