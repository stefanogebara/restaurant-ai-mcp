/**
 * 3 mock restaurant demo presets with realistic fake data.
 * Each preset defines tables, reservations, active parties, and waitlist
 * for a different cuisine type.
 *
 * Used by useDemoState hook via ?preset=italian|japanese|brazilian URL param.
 */

import type { UpcomingReservation, ActiveParty } from '../types/host.types';
import type { DemoWaitlistEntry } from '../hooks/useDemoState';

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

function departureAt(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

/** Fixed evening timestamp for demo — always shows a realistic dinner time */
function eveningTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

interface DemoTable {
  id: string;
  table_number: string;
  capacity: number;
  status: 'Available' | 'Occupied' | 'Reserved';
  location: string;
}

export interface DemoPreset {
  name: string;
  cuisine: string;
  neighborhood: string;
  tables: DemoTable[];
  reservations: UpcomingReservation[];
  activeParties: ActiveParty[];
  waitlist: DemoWaitlistEntry[];
}

// ---------- 1. Italian Trattoria (Rome-inspired) ----------

const italianPreset: DemoPreset = {
  name: 'Trattoria da Marco',
  cuisine: 'Italian',
  neighborhood: 'Little Italy',
  tables: [
    { id: 'it1', table_number: '1', capacity: 2, status: 'Occupied', location: 'Terrace' },
    { id: 'it2', table_number: '2', capacity: 2, status: 'Available', location: 'Terrace' },
    { id: 'it3', table_number: '3', capacity: 4, status: 'Reserved', location: 'Main Room' },
    { id: 'it4', table_number: '4', capacity: 4, status: 'Available', location: 'Main Room' },
    { id: 'it5', table_number: '5', capacity: 6, status: 'Available', location: 'Main Room' },
    { id: 'it6', table_number: '6', capacity: 2, status: 'Available', location: 'Wine Bar' },
    { id: 'it7', table_number: '7', capacity: 4, status: 'Occupied', location: 'Private Room' },
    { id: 'it8', table_number: '8', capacity: 8, status: 'Available', location: 'Private Room' },
  ],
  reservations: [
    {
      reservation_id: 'it-r1',
      customer_name: 'Giovanni Bianchi',
      customer_phone: '+39 333 456 7890',
      party_size: 4,
      date: today,
      time: '12:00',
      reservation_time: `${today}T12:00:00`,
      special_requests: 'Gluten-free pasta options',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'it-r2',
      customer_name: 'Sophia Martinez',
      customer_phone: '+1 555-234-5678',
      party_size: 2,
      date: today,
      time: '13:00',
      reservation_time: `${today}T13:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'it-r3',
      customer_name: 'Alessandro Russo',
      customer_phone: '+39 347 678 9012',
      party_size: 6,
      date: today,
      time: '19:30',
      reservation_time: `${today}T19:30:00`,
      special_requests: 'Anniversary dinner — dessert surprise',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'it-r4',
      customer_name: 'Emma Thompson',
      customer_phone: '+1 555-345-6789',
      party_size: 2,
      date: today,
      time: '20:00',
      reservation_time: `${today}T20:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'it-r5',
      customer_name: 'Marco Conti',
      customer_phone: '+39 366 789 0123',
      party_size: 8,
      date: tomorrow,
      time: '19:00',
      reservation_time: `${tomorrow}T19:00:00`,
      special_requests: 'Business dinner — private room',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'it-r6',
      customer_name: 'Isabella Romano',
      customer_phone: '+39 320 890 1234',
      party_size: 2,
      date: tomorrow,
      time: '20:30',
      reservation_time: `${tomorrow}T20:30:00`,
      checked_in: false,
      status: 'confirmed',
    },
  ],
  activeParties: [
    {
      service_id: 'it-srv1',
      customer_name: 'Roberto Esposito',
      customer_phone: '+39 345 111 2222',
      party_size: 2,
      tables: ['1'],
      seated_at: eveningTime(19, 5),
      estimated_departure: eveningTime(20, 25),
      time_elapsed_minutes: 55,
      time_remaining_minutes: 25,
      is_overdue: false,
    },
    {
      service_id: 'it-srv2',
      customer_name: 'Laura Colombo',
      customer_phone: '+39 333 444 5555',
      party_size: 4,
      tables: ['7'],
      seated_at: eveningTime(19, 30),
      estimated_departure: eveningTime(20, 30),
      time_elapsed_minutes: 30,
      time_remaining_minutes: 60,
      is_overdue: false,
    },
  ],
  waitlist: [
    {
      id: 'it-w1',
      customer_name: 'David Chen',
      customer_phone: '+1 555-567-8901',
      party_size: 2,
      estimated_wait: 20,
      added_at: eveningTime(19, 48),
      status: 'Waiting',
    },
    {
      id: 'it-w2',
      customer_name: 'Francesca Moretti',
      customer_phone: '+39 349 678 9012',
      party_size: 4,
      estimated_wait: 30,
      added_at: eveningTime(19, 55),
      status: 'Waiting',
      special_requests: 'High chair needed',
    },
  ],
};

// ---------- 2. Japanese Izakaya ----------

const japanesePreset: DemoPreset = {
  name: 'Sakura Izakaya',
  cuisine: 'Japanese',
  neighborhood: 'Midtown',
  tables: [
    { id: 'jp1', table_number: '1', capacity: 2, status: 'Available', location: 'Sushi Bar' },
    { id: 'jp2', table_number: '2', capacity: 2, status: 'Occupied', location: 'Sushi Bar' },
    { id: 'jp3', table_number: '3', capacity: 4, status: 'Available', location: 'Sushi Bar' },
    { id: 'jp4', table_number: '4', capacity: 4, status: 'Reserved', location: 'Main Floor' },
    { id: 'jp5', table_number: '5', capacity: 4, status: 'Available', location: 'Main Floor' },
    { id: 'jp6', table_number: '6', capacity: 6, status: 'Available', location: 'Main Floor' },
    { id: 'jp7', table_number: '7', capacity: 2, status: 'Occupied', location: 'Tatami Room' },
    { id: 'jp8', table_number: '8', capacity: 6, status: 'Available', location: 'Tatami Room' },
  ],
  reservations: [
    {
      reservation_id: 'jp-r1',
      customer_name: 'Takeshi Yamamoto',
      customer_phone: '+81 90-1234-5678',
      party_size: 2,
      date: today,
      time: '12:00',
      reservation_time: `${today}T12:00:00`,
      special_requests: 'Omakase course',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'jp-r2',
      customer_name: 'Sarah Kim',
      customer_phone: '+1 555-456-7890',
      party_size: 4,
      date: today,
      time: '13:00',
      reservation_time: `${today}T13:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'jp-r3',
      customer_name: 'Yuki Tanaka',
      customer_phone: '+81 80-2345-6789',
      party_size: 6,
      date: today,
      time: '18:30',
      reservation_time: `${today}T18:30:00`,
      special_requests: 'Birthday — tatami room preferred',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'jp-r4',
      customer_name: 'Michael Park',
      customer_phone: '+1 555-567-8901',
      party_size: 2,
      date: today,
      time: '19:00',
      reservation_time: `${today}T19:00:00`,
      special_requests: 'Shellfish allergy',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'jp-r5',
      customer_name: 'Haruki Sato',
      customer_phone: '+81 70-3456-7890',
      party_size: 4,
      date: tomorrow,
      time: '19:00',
      reservation_time: `${tomorrow}T19:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'jp-r6',
      customer_name: 'Emily Wang',
      customer_phone: '+1 555-678-9012',
      party_size: 2,
      date: tomorrow,
      time: '20:00',
      reservation_time: `${tomorrow}T20:00:00`,
      special_requests: 'Sake pairing',
      checked_in: false,
      status: 'confirmed',
    },
  ],
  activeParties: [
    {
      service_id: 'jp-srv1',
      customer_name: 'Kenji Nakamura',
      customer_phone: '+81 90-5555-1111',
      party_size: 2,
      tables: ['2'],
      seated_at: eveningTime(19, 20),
      estimated_departure: departureAt(20),
      time_elapsed_minutes: 40,
      time_remaining_minutes: 20,
      is_overdue: false,
    },
    {
      service_id: 'jp-srv2',
      customer_name: 'Aiko Watanabe',
      customer_phone: '+81 80-6666-2222',
      party_size: 2,
      tables: ['7'],
      seated_at: eveningTime(19, 35),
      estimated_departure: departureAt(50),
      time_elapsed_minutes: 25,
      time_remaining_minutes: 50,
      is_overdue: false,
    },
  ],
  waitlist: [
    {
      id: 'jp-w1',
      customer_name: 'James Wilson',
      customer_phone: '+1 555-789-0123',
      party_size: 2,
      estimated_wait: 15,
      added_at: eveningTime(19, 52),
      status: 'Waiting',
    },
    {
      id: 'jp-w2',
      customer_name: 'Mei Suzuki',
      customer_phone: '+81 90-7777-3333',
      party_size: 6,
      estimated_wait: 35,
      added_at: eveningTime(19, 57),
      status: 'Waiting',
      special_requests: 'Private tatami room',
    },
  ],
};

// ---------- 3. Brazilian Boteco ----------

const brazilianPreset: DemoPreset = {
  name: 'Cantina da Praça',
  cuisine: 'Brazilian',
  neighborhood: 'Vila Madalena, São Paulo',
  tables: [
    { id: 'br1', table_number: '1', capacity: 2, status: 'Available', location: 'Varanda' },
    { id: 'br2', table_number: '2', capacity: 4, status: 'Occupied', location: 'Varanda' },
    { id: 'br3', table_number: '3', capacity: 4, status: 'Available', location: 'Varanda' },
    { id: 'br4', table_number: '4', capacity: 6, status: 'Available', location: 'Salão Principal' },
    { id: 'br5', table_number: '5', capacity: 4, status: 'Reserved', location: 'Salão Principal' },
    { id: 'br6', table_number: '6', capacity: 2, status: 'Available', location: 'Salão Principal' },
    { id: 'br7', table_number: '7', capacity: 8, status: 'Available', location: 'Bar' },
    { id: 'br8', table_number: '8', capacity: 2, status: 'Occupied', location: 'Bar' },
    { id: 'br9', table_number: '9', capacity: 4, status: 'Available', location: 'Bar' },
  ],
  reservations: [
    {
      reservation_id: 'br-r1',
      customer_name: 'Lucas Oliveira',
      customer_phone: '+55 11 99876 5432',
      party_size: 4,
      date: today,
      time: '12:00',
      reservation_time: `${today}T12:00:00`,
      special_requests: 'Mesa perto da janela',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'br-r2',
      customer_name: 'Mariana Santos',
      customer_phone: '+55 21 98765 4321',
      party_size: 2,
      date: today,
      time: '13:00',
      reservation_time: `${today}T13:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'br-r3',
      customer_name: 'Rafael Costa',
      customer_phone: '+55 11 97654 3210',
      party_size: 8,
      date: today,
      time: '19:30',
      reservation_time: `${today}T19:30:00`,
      special_requests: 'Aniversário — bolo surpresa',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'br-r4',
      customer_name: 'Fernanda Lima',
      customer_phone: '+55 11 96543 2109',
      party_size: 2,
      date: today,
      time: '20:00',
      reservation_time: `${today}T20:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'br-r5',
      customer_name: 'Gustavo Pereira',
      customer_phone: '+55 21 95432 1098',
      party_size: 6,
      date: tomorrow,
      time: '19:00',
      reservation_time: `${tomorrow}T19:00:00`,
      special_requests: 'Rodízio de churrasco para o grupo',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'br-r6',
      customer_name: 'Camila Rodrigues',
      customer_phone: '+55 11 94321 0987',
      party_size: 2,
      date: tomorrow,
      time: '20:30',
      reservation_time: `${tomorrow}T20:30:00`,
      checked_in: false,
      status: 'confirmed',
    },
  ],
  activeParties: [
    {
      service_id: 'br-srv1',
      customer_name: 'Pedro Henrique',
      customer_phone: '+55 11 98888 1111',
      party_size: 4,
      tables: ['2'],
      seated_at: eveningTime(19, 25),
      estimated_departure: departureAt(45),
      time_elapsed_minutes: 35,
      time_remaining_minutes: 45,
      is_overdue: false,
    },
    {
      service_id: 'br-srv2',
      customer_name: 'Beatriz Mendes',
      customer_phone: '+55 21 99999 2222',
      party_size: 2,
      tables: ['8'],
      seated_at: eveningTime(19, 45),
      estimated_departure: departureAt(60),
      time_elapsed_minutes: 15,
      time_remaining_minutes: 60,
      is_overdue: false,
    },
  ],
  waitlist: [
    {
      id: 'br-w1',
      customer_name: 'João Pedro Nascimento',
      customer_phone: '+55 11 96789 0123',
      party_size: 4,
      estimated_wait: 20,
      added_at: eveningTime(19, 50),
      status: 'Waiting',
    },
    {
      id: 'br-w2',
      customer_name: 'Ana Clara Silva',
      customer_phone: '+55 21 97890 1234',
      party_size: 2,
      estimated_wait: 10,
      added_at: eveningTime(19, 56),
      status: 'Waiting',
      special_requests: 'Varanda, por favor',
    },
  ],
};

// ---------- Export preset map ----------

export const DEMO_PRESETS: Record<string, DemoPreset> = {
  italian: italianPreset,
  japanese: japanesePreset,
  brazilian: brazilianPreset,
};

export type DemoPresetKey = keyof typeof DEMO_PRESETS;
