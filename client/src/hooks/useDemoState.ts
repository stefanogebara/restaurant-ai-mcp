import { useState, useCallback, useMemo, useEffect } from 'react';
import type { UpcomingReservation, ActiveParty } from '../types/host.types';
import { DEMO_PRESETS, type DemoPreset } from '../data/demoPresets';

// ---------- Seed data helpers ----------

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

// ---------- Seed tables ----------

export interface DemoTable {
  id: string;
  table_number: string;
  capacity: number;
  status: 'Available' | 'Occupied' | 'Reserved';
  location: string;
}

const INITIAL_TABLES: DemoTable[] = [
  { id: 't1', table_number: '1', capacity: 2, status: 'Available', location: 'Indoor' },
  { id: 't2', table_number: '2', capacity: 2, status: 'Occupied', location: 'Indoor' },
  { id: 't3', table_number: '3', capacity: 4, status: 'Reserved', location: 'Indoor' },
  { id: 't4', table_number: '4', capacity: 4, status: 'Available', location: 'Indoor' },
  { id: 't5', table_number: '5', capacity: 6, status: 'Occupied', location: 'Patio' },
  { id: 't6', table_number: '6', capacity: 2, status: 'Available', location: 'Patio' },
  { id: 't7', table_number: '7', capacity: 4, status: 'Available', location: 'Patio' },
  { id: 't8', table_number: '8', capacity: 2, status: 'Available', location: 'Bar' },
  { id: 't9', table_number: '9', capacity: 4, status: 'Available', location: 'Bar' },
];

// ---------- Seed reservations ----------

const INITIAL_RESERVATIONS: UpcomingReservation[] = [
  {
    reservation_id: 'r1',
    customer_name: 'Ana Clara Santos',
    customer_phone: '+55 11 98234-5678',
    party_size: 4,
    date: today,
    time: '12:30',
    reservation_time: `${today}T12:30:00`,
    special_requests: 'Mesa perto da janela',
    checked_in: false,
    status: 'confirmed',
    customer_tier: 'vip',
    visit_count: 14,
    avg_spend: 95,
    is_regular: true,
    dietary_restrictions: ['sem gluten'],
    seating_preference: 'Janela',
  },
  {
    reservation_id: 'r2',
    customer_name: 'Pedro Henrique Oliveira',
    customer_phone: '+55 11 97345-6789',
    party_size: 2,
    date: today,
    time: '13:00',
    reservation_time: `${today}T13:00:00`,
    checked_in: false,
    status: 'confirmed',
    customer_tier: 'regular',
    visit_count: 6,
    avg_spend: 72,
    is_regular: true,
  },
  {
    reservation_id: 'r3',
    customer_name: 'Juliana Costa',
    customer_phone: '+55 11 96456-7890',
    party_size: 6,
    date: today,
    time: '19:00',
    reservation_time: `${today}T19:00:00`,
    special_requests: 'Aniversario',
    checked_in: false,
    status: 'confirmed',
    customer_tier: 'occasional',
    visit_count: 3,
    avg_spend: 110,
    special_occasion: 'Aniversario',
  },
  {
    reservation_id: 'r4',
    customer_name: 'Rafael Almeida',
    customer_phone: '+55 11 95567-8901',
    party_size: 2,
    date: today,
    time: '20:00',
    reservation_time: `${today}T20:00:00`,
    checked_in: false,
    status: 'confirmed',
    first_time_visitor: true,
  },
  {
    reservation_id: 'r5',
    customer_name: 'Camila Rodrigues',
    customer_phone: '+55 11 94678-9012',
    party_size: 4,
    date: tomorrow,
    time: '12:00',
    reservation_time: `${tomorrow}T12:00:00`,
    checked_in: false,
    status: 'confirmed',
    customer_tier: 'vip',
    visit_count: 22,
    avg_spend: 88,
    is_regular: true,
  },
  {
    reservation_id: 'r6',
    customer_name: 'Lucas Ferreira',
    customer_phone: '+55 11 93789-0123',
    party_size: 2,
    date: tomorrow,
    time: '19:30',
    reservation_time: `${tomorrow}T19:30:00`,
    special_requests: 'Jantar de aniversario',
    checked_in: false,
    status: 'confirmed',
    customer_tier: 'regular',
    visit_count: 8,
  },
];

// ---------- Seed active parties ----------

const INITIAL_ACTIVE_PARTIES: ActiveParty[] = [
  {
    service_id: 'srv1',
    customer_name: 'Marcos Souza',
    customer_phone: '+55 11 92111-2222',
    party_size: 2,
    tables: ['2'],
    seated_at: eveningTime(19, 15),
    estimated_departure: eveningTime(20, 30),
    time_elapsed_minutes: 45,
    time_remaining_minutes: 30,
    is_overdue: false,
  },
  {
    service_id: 'srv2',
    customer_name: 'Fernanda Lima',
    customer_phone: '+55 11 91333-4444',
    party_size: 5,
    tables: ['5'],
    seated_at: eveningTime(19, 40),
    estimated_departure: eveningTime(20, 50),
    time_elapsed_minutes: 20,
    time_remaining_minutes: 70,
    is_overdue: false,
  },
];

// ---------- Waitlist entry ----------

export interface DemoWaitlistEntry {
  id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  estimated_wait: number;
  added_at: string;
  status: 'Waiting';
  special_requests?: string;
}

const INITIAL_WAITLIST: DemoWaitlistEntry[] = [
  {
    id: 'w1',
    customer_name: 'Joao Pedro Nascimento',
    customer_phone: '+55 11 99567-8901',
    party_size: 2,
    estimated_wait: 15,
    added_at: eveningTime(19, 50),
    status: 'Waiting',
  },
  {
    id: 'w2',
    customer_name: 'Beatriz Mendes',
    customer_phone: '+55 11 99678-9012',
    party_size: 4,
    estimated_wait: 25,
    added_at: eveningTime(19, 55),
    status: 'Waiting',
    special_requests: 'Cadeirinha infantil',
  },
];

// ---------- Walk-in form data ----------

export interface WalkInFormData {
  customer_name: string;
  customer_phone: string;
  party_size: number;
}

// ---------- Counter ----------

let nextId = 100;
function genId(prefix: string): string {
  nextId += 1;
  return `${prefix}${nextId}`;
}

// ---------- API override data (for token-based outreach demos) ----------

export interface DemoOverrideData {
  tables?: DemoTable[];
  reservations?: UpcomingReservation[];
  isTokenDemo?: boolean;
}

// Realistic seed data for token-based demos (so the dashboard feels alive)
// Use relative times so wait/elapsed are always reasonable regardless of current time
function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}
function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

const TOKEN_DEMO_ACTIVE_PARTIES: ActiveParty[] = [
  {
    service_id: 'srv-t1',
    customer_name: 'Marcos Oliveira',
    customer_phone: '+55 11 98765-4321',
    party_size: 2,
    tables: ['1'],
    seated_at: minutesAgo(35),
    estimated_departure: minutesFromNow(55),
    time_elapsed_minutes: 35,
    time_remaining_minutes: 55,
    is_overdue: false,
  },
  {
    service_id: 'srv-t2',
    customer_name: 'Fernanda Costa',
    customer_phone: '+55 11 97654-3210',
    party_size: 4,
    tables: ['5'],
    seated_at: minutesAgo(20),
    estimated_departure: minutesFromNow(70),
    time_elapsed_minutes: 20,
    time_remaining_minutes: 70,
    is_overdue: false,
  },
];

const TOKEN_DEMO_WAITLIST: DemoWaitlistEntry[] = [
  {
    id: 'wt1',
    customer_name: 'Ricardo Mendes',
    customer_phone: '+55 11 96543-2109',
    party_size: 3,
    estimated_wait: 20,
    added_at: minutesAgo(8),
    status: 'Waiting',
  },
  {
    id: 'wt2',
    customer_name: 'Carolina Lima',
    customer_phone: '+55 11 95432-1098',
    party_size: 2,
    estimated_wait: 30,
    added_at: minutesAgo(3),
    status: 'Waiting',
    special_requests: 'Mesa na varanda',
  },
];

// ---------- Hook ----------

export function useDemoState(presetKey?: string, overrideData?: DemoOverrideData) {
  const preset: DemoPreset | undefined = presetKey ? DEMO_PRESETS[presetKey] : undefined;
  const [tables, setTables] = useState<DemoTable[]>(overrideData?.tables ?? preset?.tables ?? INITIAL_TABLES);
  const [reservations, setReservations] = useState<UpcomingReservation[]>(overrideData?.reservations ?? preset?.reservations ?? INITIAL_RESERVATIONS);
  const [activeParties, setActiveParties] = useState<ActiveParty[]>(overrideData?.isTokenDemo ? TOKEN_DEMO_ACTIVE_PARTIES : (preset?.activeParties ?? INITIAL_ACTIVE_PARTIES));
  const [waitlist, setWaitlist] = useState<DemoWaitlistEntry[]>(overrideData?.isTokenDemo ? TOKEN_DEMO_WAITLIST : (preset?.waitlist ?? INITIAL_WAITLIST));
  const [completedCount, setCompletedCount] = useState(3);

  // Sync state when API override data arrives (useState ignores changes after mount)
  useEffect(() => {
    if (overrideData?.tables) {
      let newTables = overrideData.tables;
      // Mark tables occupied by active parties
      if (overrideData.isTokenDemo) {
        const occupiedTableNums = new Set(TOKEN_DEMO_ACTIVE_PARTIES.flatMap(p => p.tables));
        newTables = newTables.map(t =>
          occupiedTableNums.has(t.table_number)
            ? { ...t, status: 'Occupied' as const }
            : t
        );
      }
      setTables(newTables);
    }
    if (overrideData?.reservations) setReservations(overrideData.reservations);
    if (overrideData?.isTokenDemo) {
      setActiveParties(TOKEN_DEMO_ACTIVE_PARTIES);
      setWaitlist(TOKEN_DEMO_WAITLIST);
    }
  }, [overrideData?.tables, overrideData?.reservations, overrideData?.isTokenDemo]);

  // ---- Derived ----
  const todayReservations = useMemo(
    () => reservations.filter((r) => r.date === today),
    [reservations],
  );
  const tomorrowReservations = useMemo(
    () => reservations.filter((r) => r.date === tomorrow),
    [reservations],
  );

  const occupiedTables = useMemo(
    () => tables.filter((t) => t.status === 'Occupied').length,
    [tables],
  );
  const totalTables = tables.length;
  const totalGuests = useMemo(
    () => activeParties.reduce((sum, p) => sum + p.party_size, 0),
    [activeParties],
  );
  const seatedReservations = useMemo(
    () => todayReservations.filter((r) => r.checked_in).length,
    [todayReservations],
  );

  // ---- Actions ----

  /** Check-in a reservation (marks checked_in = true) */
  const checkIn = useCallback((reservationId: string) => {
    setReservations((prev) =>
      prev.map((r) =>
        r.reservation_id === reservationId ? { ...r, checked_in: true } : r,
      ),
    );
  }, []);

  /** Seat a party at a table — creates an active party and marks the table occupied */
  const seatParty = useCallback(
    (data: { customer_name: string; party_size: number; tableId: string; reservationId?: string }) => {
      const table = tables.find((t) => t.id === data.tableId);
      if (!table) return;

      // Mark table occupied
      setTables((prev) =>
        prev.map((t) => (t.id === data.tableId ? { ...t, status: 'Occupied' as const } : t)),
      );

      // Create active party
      const newParty: ActiveParty = {
        service_id: genId('srv'),
        customer_name: data.customer_name,
        customer_phone: '',
        party_size: data.party_size,
        tables: [table.table_number],
        seated_at: new Date().toISOString(),
        estimated_departure: departureAt(75),
        time_elapsed_minutes: 0,
        time_remaining_minutes: 75,
        is_overdue: false,
      };
      setActiveParties((prev) => [...prev, newParty]);

      // If from a reservation, mark it checked in
      if (data.reservationId) {
        checkIn(data.reservationId);
      }
    },
    [tables, checkIn],
  );

  /** Complete service for an active party */
  const [totalRevenue, setTotalRevenue] = useState(0);

  const completeService = useCallback((serviceId: string, billAmount?: number) => {
    if (billAmount && billAmount > 0) {
      setTotalRevenue((r) => r + billAmount);
    }
    setActiveParties((prev) => {
      const party = prev.find((p) => p.service_id === serviceId);
      if (party) {
        // Free the tables
        setTables((t) =>
          t.map((table) =>
            party.tables.includes(table.table_number)
              ? { ...table, status: 'Available' as const }
              : table,
          ),
        );
        setCompletedCount((c) => c + 1);
      }
      return prev.filter((p) => p.service_id !== serviceId);
    });
  }, []);

  /** Add a walk-in guest directly to active parties */
  const addWalkIn = useCallback(
    (data: WalkInFormData) => {
      // Find first available table that fits
      const available = tables.find(
        (t) => t.status === 'Available' && t.capacity >= data.party_size,
      );
      if (!available) return false;

      seatParty({
        customer_name: data.customer_name,
        party_size: data.party_size,
        tableId: available.id,
      });
      return true;
    },
    [tables, seatParty],
  );

  /** Cancel (remove) a reservation */
  const cancelReservation = useCallback((reservationId: string) => {
    setReservations((prev) => prev.filter((r) => r.reservation_id !== reservationId));
  }, []);

  /** Add a guest to the waitlist */
  const addToWaitlist = useCallback((data: WalkInFormData & { special_requests?: string }) => {
    const entry: DemoWaitlistEntry = {
      id: genId('w'),
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      party_size: data.party_size,
      estimated_wait: 15 + Math.floor(Math.random() * 20),
      added_at: new Date().toISOString(),
      status: 'Waiting',
      special_requests: data.special_requests,
    };
    setWaitlist((prev) => [...prev, entry]);
  }, []);

  /** Seat a guest from the waitlist */
  const seatFromWaitlist = useCallback(
    (waitlistId: string) => {
      const entry = waitlist.find((w) => w.id === waitlistId);
      if (!entry) return false;

      const available = tables.find(
        (t) => t.status === 'Available' && t.capacity >= entry.party_size,
      );
      if (!available) return false;

      // Remove from waitlist
      setWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));

      // Seat them
      seatParty({
        customer_name: entry.customer_name,
        party_size: entry.party_size,
        tableId: available.id,
      });
      return true;
    },
    [waitlist, tables, seatParty],
  );

  // ---- Stats ----
  const stats = useMemo(
    () => ({
      occupiedTables,
      totalTables,
      reservationsToday: todayReservations.length,
      seatedReservations,
      waitlistCount: waitlist.length,
      activeParties: activeParties.length,
      totalGuests,
      completedCount,
      totalRevenue,
    }),
    [occupiedTables, totalTables, todayReservations, seatedReservations, waitlist, activeParties, totalGuests, completedCount, totalRevenue],
  );

  return {
    tables,
    reservations,
    todayReservations,
    tomorrowReservations,
    activeParties,
    waitlist,
    stats,
    checkIn,
    cancelReservation,
    seatParty,
    completeService,
    addWalkIn,
    addToWaitlist,
    seatFromWaitlist,
  };
}
