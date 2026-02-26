/**
 * DashboardMockup — Inline product preview for the landing hero.
 * Renders a stylized mini-dashboard using real Tailwind classes.
 * No real data — purely presentational.
 */
export default function DashboardMockup() {
  const tables = [
    { id: 1, label: 'T1', seats: 2, status: 'available' },
    { id: 2, label: 'T2', seats: 4, status: 'occupied' },
    { id: 3, label: 'T3', seats: 4, status: 'occupied' },
    { id: 4, label: 'T4', seats: 6, status: 'available' },
    { id: 5, label: 'T5', seats: 2, status: 'reserved' },
    { id: 6, label: 'T6', seats: 4, status: 'occupied' },
  ];

  const reservations = [
    { name: 'Sarah M.', time: '7:30 PM', size: 4, status: 'confirmed' },
    { name: 'James K.', time: '8:00 PM', size: 2, status: 'confirmed' },
    { name: 'Chen F.', time: '8:30 PM', size: 6, status: 'pending' },
  ];

  const stats = [
    { label: 'Occupied', value: '3/6' },
    { label: 'Tonight', value: '12' },
    { label: 'Waiting', value: '2' },
    { label: 'Guests', value: '19' },
  ];

  const tableColor = (s: string) =>
    s === 'occupied' ? 'bg-burgundy/90 text-white' :
    s === 'reserved' ? 'bg-amber-400/80 text-amber-900' :
    'bg-white border border-border-gray text-stone-gray';

  return (
    <div className="relative w-full max-w-[800px] mx-auto select-none pointer-events-none" aria-hidden="true">
      {/* Browser chrome */}
      <div className="bg-[#2a2a2a] rounded-t-2xl px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <div className="flex-1 mx-4 bg-[#1a1a1a] rounded-md px-3 py-1 text-[11px] text-white/30 text-center truncate">
          restaurant-ai-mcp.vercel.app/host-dashboard
        </div>
      </div>

      {/* Dashboard shell */}
      <div className="bg-soft-gray border border-border-gray border-t-0 rounded-b-2xl overflow-hidden shadow-2xl">
        <div className="flex h-[360px]">
          {/* Sidebar */}
          <div className="w-[52px] bg-deep-charcoal flex flex-col items-center py-4 gap-4 flex-shrink-0">
            <div className="w-6 h-6 rounded-lg bg-burgundy" />
            <div className="w-[1px] h-4 bg-white/10" />
            {['▤', '☰', '📊', '☎', '⚙'].map((ic, i) => (
              <div key={i} className={`text-[14px] ${i === 0 ? 'text-white' : 'text-white/30'}`}>{ic}</div>
            ))}
          </div>

          {/* Main area */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-deep-charcoal">Dashboard</div>
                <div className="text-[10px] text-muted-stone">Thursday, 26 Feb</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-burgundy text-white text-[10px] font-semibold rounded-lg">+ Walk-in</div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2">
              {stats.map((s, i) => (
                <div key={i} className="bg-white border border-border-gray rounded-xl px-3 py-2">
                  <div className="text-[11px] text-muted-stone">{s.label}</div>
                  <div className="text-[14px] font-bold text-deep-charcoal">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Two column: tables + reservations */}
            <div className="flex gap-3 flex-1 min-h-0">
              {/* Table layout */}
              <div className="flex-1 bg-white border border-border-gray rounded-xl p-3">
                <div className="text-[10px] font-semibold text-deep-charcoal mb-2">Table Layout</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {tables.map((t) => (
                    <div key={t.id} className={`rounded-lg p-1.5 text-center ${tableColor(t.status)}`}>
                      <div className="text-[11px] font-semibold">{t.label}</div>
                      <div className="text-[9px] opacity-70">{t.seats}p</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-2 pt-2 border-t border-border-gray">
                  {[['bg-burgundy/90','Occupied'],['bg-amber-400/80','Reserved'],['bg-white border border-border-gray','Free']].map(([cls, lbl], i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-sm ${cls}`} />
                      <span className="text-[8px] text-muted-stone">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reservations */}
              <div className="flex-1 bg-white border border-border-gray rounded-xl p-3">
                <div className="text-[10px] font-semibold text-deep-charcoal mb-2">Tonight's Reservations</div>
                <div className="space-y-1.5">
                  {reservations.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border-gray last:border-0">
                      <div>
                        <div className="text-[10px] font-medium text-deep-charcoal">{r.name}</div>
                        <div className="text-[9px] text-muted-stone">{r.time} · {r.size} guests</div>
                      </div>
                      <div className={`px-1.5 py-0.5 rounded-full text-[8px] font-medium ${
                        r.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.status}
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI indicator */}
                <div className="mt-2 pt-2 border-t border-border-gray flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-600" />
                  </span>
                  <span className="text-[9px] text-muted-stone">AI agent handling calls</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Glow effect */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-burgundy/20 blur-2xl rounded-full" />
    </div>
  );
}
