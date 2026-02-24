/// <reference path="../types/elevenlabs.d.ts" />
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import DemoBanner from '../components/demo/DemoBanner';
import StatsBar from '../components/dashboard/StatsBar';
import ReservationsList from '../components/dashboard/ReservationsList';
import type { Table, UpcomingReservation } from '../types/host.types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

interface DemoRestaurant {
  id: string;
  restaurant_name: string;
  restaurant_type: string;
  city: string;
  country: string;
  demo_expires_at: string;
  demo_token: string;
  business_hours: Record<string, unknown>;
  max_party_size: number;
  slug?: string;
}

interface DemoSession {
  success: boolean;
  restaurant: DemoRestaurant;
  tables: Table[];
  reservations: UpcomingReservation[];
  daysLeft: number;
}

export default function DemoDashboard() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/demo?action=session&token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: DemoSession) => {
        if (data.success) {
          setSession(data);
        } else {
          setError('This demo link is invalid or has expired.');
        }
      })
      .catch(() => setError('Could not load demo session. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Load ElevenLabs widget script once when session is available
  useEffect(() => {
    if (!session) return;
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.type = 'text/javascript';
    script.onload = () => setWidgetLoaded(true);
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [session]);

  // Mount ElevenLabs widget with dynamic-variables after container is ready
  useEffect(() => {
    if (!session || !widgetContainerRef.current) return;
    const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';
    if (!agentId) return;

    const { restaurant } = session;
    const widget = document.createElement('elevenlabs-convai') as HTMLElement;
    widget.setAttribute('agent-id', agentId);
    widget.setAttribute(
      'dynamic-variables',
      JSON.stringify({
        restaurant_name: restaurant.restaurant_name,
        cuisine_type: restaurant.restaurant_type,
        city: restaurant.city,
      }),
    );

    // Replace children (safe DOM method — no user-controlled HTML)
    widgetContainerRef.current.replaceChildren(widget);
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-deep-charcoal opacity-50">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ThiingsIcon name="alert-circle" pxSize={24} className="text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-red-900 mb-2">Demo unavailable</h3>
          <p className="text-sm text-red-700 mb-6">{error || 'This demo session could not be loaded.'}</p>
          <Link
            to="/demo/setup"
            className="inline-block px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Create a new demo
          </Link>
        </div>
      </div>
    );
  }

  const { restaurant, tables, reservations, daysLeft } = session;

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

  const todayReservations = reservations.filter((r) => r.date === today);
  const tomorrowReservations = reservations.filter((r) => r.date === tomorrow);

  const occupiedTables = tables.filter((t) => t.status === 'Occupied').length;
  const totalTables = tables.length;
  const totalGuests = todayReservations.reduce((sum, r) => sum + (r.party_size || 0), 0);
  const seatedReservations = todayReservations.filter((r) => r.checked_in).length;

  const bookingHref = restaurant.slug ? `/book/${restaurant.slug}` : '#';

  return (
    <div className="min-h-screen bg-soft-gray">
      <DemoBanner daysLeft={daysLeft} token={token!} />

      {/* Page header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
          {restaurant.restaurant_name}
          <span className="ml-2 text-base font-light text-warm-stone">
            &mdash; {restaurant.restaurant_type} &middot; {restaurant.city}
          </span>
        </h1>
        <p className="text-sm text-muted-stone mt-1">
          This is your personalised demo dashboard. Data is sample-only.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pb-20 space-y-6">
        {/* Stats */}
        <StatsBar
          occupiedTables={occupiedTables}
          totalTables={totalTables}
          reservationsToday={todayReservations.length}
          seatedReservations={seatedReservations}
          waitlistCount={0}
          activeParties={occupiedTables}
          totalGuests={totalGuests}
          isLoading={false}
        />

        {/* Main content: 2-column */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Left: Reservations list */}
          <ReservationsList
            todayReservations={todayReservations}
            tomorrowReservations={tomorrowReservations}
            onCheckIn={() => {}}
            onIntervention={() => {}}
            isLoading={false}
          />

          {/* Right: action cards */}
          <div className="space-y-4">
            {/* Try booking widget card */}
            <div className="bg-white border border-border-gray rounded-2xl p-6">
              <h3 className="text-base font-semibold text-deep-charcoal mb-1 tracking-tight">
                Customer booking portal
              </h3>
              <p className="text-sm text-warm-stone font-light mb-4">
                See what your guests experience when booking online.
              </p>
              <Link
                to={bookingHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Try the booking widget
                <ThiingsIcon name="chevron-right" pxSize={16} />
              </Link>
            </div>

            {/* ElevenLabs voice widget card */}
            <div className="bg-white border border-border-gray rounded-2xl p-6">
              <div className="text-xs font-semibold tracking-[1.5px] uppercase text-muted-stone mb-3">
                AI Voice Agent
              </div>
              <h3 className="text-base font-semibold text-deep-charcoal mb-1 tracking-tight">
                {restaurant.restaurant_name} AI Host
              </h3>
              <p className="text-sm text-warm-stone font-light mb-5">
                Powered by ElevenLabs &mdash; personalised for your restaurant.
              </p>

              <div className="flex items-center justify-center min-h-[160px]">
                {import.meta.env.VITE_ELEVENLABS_AGENT_ID ? (
                  <div ref={widgetContainerRef} className="elevenlabs-widget-container" />
                ) : (
                  <div className="w-full p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
                    <p className="text-xs text-amber-700 font-medium">
                      Set <code className="bg-amber-100 px-1 rounded">VITE_ELEVENLABS_AGENT_ID</code> to activate the voice agent.
                    </p>
                  </div>
                )}
              </div>

              {widgetLoaded && (
                <div className="flex items-center gap-2 mt-4">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-700">AI Agent Online</span>
                </div>
              )}
            </div>

            {/* Upgrade CTA */}
            <div className="bg-deep-charcoal rounded-2xl p-6 text-center">
              <h3 className="text-base font-semibold text-white mb-1 tracking-tight">
                Ready to go live?
              </h3>
              <p className="text-xs text-muted-stone font-light mb-4">
                Keep your data and unlock all features.
              </p>
              <Link
                to={`/login?from=demo&token=${token}`}
                className="inline-block px-5 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
              >
                Upgrade now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
