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

function seededAt(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function departureAt(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
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
      seated_at: seededAt(55),
      estimated_departure: departureAt(25),
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
      seated_at: seededAt(30),
      estimated_departure: departureAt(60),
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
      added_at: seededAt(12),
      status: 'Waiting',
    },
    {
      id: 'it-w2',
      customer_name: 'Francesca Moretti',
      customer_phone: '+39 349 678 9012',
      party_size: 4,
      estimated_wait: 30,
      added_at: seededAt(5),
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
      seated_at: seededAt(40),
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
      seated_at: seededAt(25),
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
      added_at: seededAt(8),
      status: 'Waiting',
    },
    {
      id: 'jp-w2',
      customer_name: 'Mei Suzuki',
      customer_phone: '+81 90-7777-3333',
      party_size: 6,
      estimated_wait: 35,
      added_at: seededAt(3),
      status: 'Waiting',
      special_requests: 'Private tatami room',
    },
  ],
};

// ---------- 3. Mexican Cantina ----------

const mexicanPreset: DemoPreset = {
  name: 'Casa Oaxaca',
  cuisine: 'Mexican',
  neighborhood: 'Mission District',
  tables: [
    { id: 'mx1', table_number: '1', capacity: 2, status: 'Available', location: 'Patio' },
    { id: 'mx2', table_number: '2', capacity: 4, status: 'Occupied', location: 'Patio' },
    { id: 'mx3', table_number: '3', capacity: 4, status: 'Available', location: 'Patio' },
    { id: 'mx4', table_number: '4', capacity: 6, status: 'Available', location: 'Main Dining' },
    { id: 'mx5', table_number: '5', capacity: 4, status: 'Reserved', location: 'Main Dining' },
    { id: 'mx6', table_number: '6', capacity: 2, status: 'Available', location: 'Main Dining' },
    { id: 'mx7', table_number: '7', capacity: 8, status: 'Available', location: 'Cantina Bar' },
    { id: 'mx8', table_number: '8', capacity: 2, status: 'Occupied', location: 'Cantina Bar' },
    { id: 'mx9', table_number: '9', capacity: 4, status: 'Available', location: 'Cantina Bar' },
  ],
  reservations: [
    {
      reservation_id: 'mx-r1',
      customer_name: 'Carlos Hernandez',
      customer_phone: '+52 55 1234 5678',
      party_size: 4,
      date: today,
      time: '12:30',
      reservation_time: `${today}T12:30:00`,
      special_requests: 'Vegan options needed',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'mx-r2',
      customer_name: 'Maria Elena Garcia',
      customer_phone: '+52 33 2345 6789',
      party_size: 2,
      date: today,
      time: '13:30',
      reservation_time: `${today}T13:30:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'mx-r3',
      customer_name: 'Diego Ramirez',
      customer_phone: '+52 81 3456 7890',
      party_size: 8,
      date: today,
      time: '19:00',
      reservation_time: `${today}T19:00:00`,
      special_requests: 'Tequila tasting for the group',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'mx-r4',
      customer_name: 'Jessica Rodriguez',
      customer_phone: '+1 555-890-1234',
      party_size: 2,
      date: today,
      time: '20:00',
      reservation_time: `${today}T20:00:00`,
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'mx-r5',
      customer_name: 'Alejandro Morales',
      customer_phone: '+52 55 4567 8901',
      party_size: 6,
      date: tomorrow,
      time: '18:30',
      reservation_time: `${tomorrow}T18:30:00`,
      special_requests: 'Live mariachi request',
      checked_in: false,
      status: 'confirmed',
    },
    {
      reservation_id: 'mx-r6',
      customer_name: 'Ana Lucia Torres',
      customer_phone: '+52 33 5678 9012',
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
      service_id: 'mx-srv1',
      customer_name: 'Miguel Sanchez',
      customer_phone: '+52 55 8888 1111',
      party_size: 4,
      tables: ['2'],
      seated_at: seededAt(35),
      estimated_departure: departureAt(45),
      time_elapsed_minutes: 35,
      time_remaining_minutes: 45,
      is_overdue: false,
    },
    {
      service_id: 'mx-srv2',
      customer_name: 'Rosa Flores',
      customer_phone: '+52 81 9999 2222',
      party_size: 2,
      tables: ['8'],
      seated_at: seededAt(15),
      estimated_departure: departureAt(60),
      time_elapsed_minutes: 15,
      time_remaining_minutes: 60,
      is_overdue: false,
    },
  ],
  waitlist: [
    {
      id: 'mx-w1',
      customer_name: 'Fernando Lopez',
      customer_phone: '+52 55 6789 0123',
      party_size: 4,
      estimated_wait: 20,
      added_at: seededAt(10),
      status: 'Waiting',
    },
    {
      id: 'mx-w2',
      customer_name: 'Patricia Gutierrez',
      customer_phone: '+52 33 7890 1234',
      party_size: 2,
      estimated_wait: 10,
      added_at: seededAt(4),
      status: 'Waiting',
      special_requests: 'Patio seating preferred',
    },
  ],
};

// ---------- Export preset map ----------

export const DEMO_PRESETS: Record<string, DemoPreset> = {
  italian: italianPreset,
  japanese: japanesePreset,
  mexican: mexicanPreset,
};

export type DemoPresetKey = keyof typeof DEMO_PRESETS;
