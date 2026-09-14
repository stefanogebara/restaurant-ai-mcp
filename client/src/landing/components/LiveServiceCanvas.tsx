import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from '../../components/common/ThiingsIcon';

type TableState = 'seated' | 'reserved' | 'available' | 'turning';

interface ServiceTableProps {
  number: string;
  seats: number;
  state: TableState;
  guest?: string;
  time?: string;
  className: string;
  shape?: 'round' | 'long';
}

const stateStyles: Record<TableState, string> = {
  seated: 'border-[#EEE6D8] bg-[#EEE6D8] text-[#1C1917]',
  reserved: 'border-amber-400/75 bg-amber-400/10 text-amber-100',
  available: 'border-white/20 bg-white/[0.035] text-white/[0.72]',
  turning: 'border-dashed border-white/[0.32] bg-white/[0.065] text-white/[0.64]',
};

function ServiceTable({ number, seats, state, guest, time, className, shape = 'round' }: ServiceTableProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`absolute flex items-center justify-center border text-center shadow-[0_10px_30px_rgba(0,0,0,.18)] ${
        shape === 'round' ? 'aspect-square rounded-full' : 'rounded-[20px]'
      } ${stateStyles[state]} ${className}`}
    >
      <span className="leading-none">
        <span className="block text-[11px] font-semibold tracking-[-0.02em] sm:text-xs">{guest ?? `T${number}`}</span>
        <span className="mt-1 block text-[8px] opacity-60 sm:text-[9px]">
          {time ?? t('landing.launch.seatCount', { count: seats, defaultValue: `${seats} seats` })}
        </span>
      </span>
      <span className="absolute -bottom-2.5 left-1/2 h-2.5 w-6 -translate-x-1/2 rounded-b-full border-x border-b border-current opacity-25" />
      <span className="absolute -top-2.5 left-1/2 h-2.5 w-6 -translate-x-1/2 rounded-t-full border-x border-t border-current opacity-25" />
    </div>
  );
}

const reservations: Array<{
  time: string;
  guest: string;
  guests: number;
  table: string;
  status: string;
  icon: IconName;
  tone: string;
}> = [
  { time: '20:30', guest: 'Helena R.', guests: 4, table: 'T08', status: 'Arriving', icon: 'map-pin', tone: 'text-amber-300' },
  { time: '20:45', guest: 'Rafael M.', guests: 2, table: 'T03', status: 'Confirmed', icon: 'check', tone: 'text-emerald-300' },
  { time: '21:00', guest: 'Camila S.', guests: 6, table: 'T11', status: 'Confirmed', icon: 'check', tone: 'text-emerald-300' },
  { time: '21:15', guest: 'João A.', guests: 3, table: 'T06', status: 'Confirmed', icon: 'check', tone: 'text-emerald-300' },
];

function ReservationRail() {
  const { t } = useTranslation();
  return (
    <aside className="border-t border-white/10 lg:border-l lg:border-t-0" aria-label={t('landing.launch.reservationRail', 'Upcoming reservations')}>
      <div className="flex items-center justify-between px-4 py-4 sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{t('landing.launch.nextLabel', 'Next')}</p>
          <h3 className="mt-1 text-sm font-medium text-white">{t('landing.launch.reservationRail', 'Upcoming reservations')}</h3>
        </div>
        <span className="text-xs tabular-nums text-white/60">4</span>
      </div>

      <div className="border-t border-white/10 lg:max-h-[410px] lg:overflow-hidden">
        {reservations.map((reservation, index) => (
          <div key={`${reservation.time}-${reservation.guest}`} className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3.5 sm:px-5 ${index > 2 ? 'hidden lg:grid' : ''} ${index !== 0 ? 'border-t border-white/[0.075]' : ''}`}>
            <span className="text-xs tabular-nums text-white/60">{reservation.time}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-white/90">{reservation.guest}</span>
              <span className="mt-0.5 block text-[10px] text-white/60">
                {t('landing.launch.guestDetail', { count: reservation.guests, table: reservation.table, defaultValue: `${reservation.guests} guests · ${reservation.table}` })}
              </span>
            </span>
            <span className={`flex items-center gap-1 text-[9px] font-medium ${reservation.tone}`}>
              <ThiingsIcon name={reservation.icon} pxSize={11} />
              <span className="hidden xl:inline">{t(`landing.launch.${reservation.status.toLowerCase()}`, reservation.status)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="hidden border-t border-white/10 px-5 py-4 text-[10px] text-white/[0.55] lg:flex lg:items-center lg:gap-2">
        <ThiingsIcon name="clock" pxSize={12} />
        {t('landing.launch.railNote', 'Times update with the dining room')}
      </div>
    </aside>
  );
}

function FloorPlan() {
  const { t } = useTranslation();
  return (
    <div className="relative min-h-[310px] overflow-hidden bg-[#191715] sm:min-h-[420px]" role="img" aria-label={t('landing.launch.floorAria', 'Live floor plan showing seated, reserved, available, and turning tables')}>
      <div className="absolute inset-x-5 top-5 flex items-center justify-between border-b border-white/[0.08] pb-3 sm:inset-x-7 sm:top-6">
        <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/[0.55]"><ThiingsIcon name="map" pxSize={13} />{t('landing.launch.mainRoom', 'Main room')}</span>
        <span className="text-[10px] text-white/50">{t('landing.launch.eightTables', '8 tables')}</span>
      </div>

      {/* Mobile layout is composed separately so table labels stay legible at 320px. */}
      <div className="absolute inset-x-4 bottom-4 top-[64px] sm:hidden">
        <ServiceTable number="02" seats={2} state="seated" guest="Maya" time="42 min" className="left-[2%] top-[3%] w-[70px]" />
        <ServiceTable number="03" seats={2} state="reserved" time="20:45" className="right-[3%] top-[5%] w-[66px]" />
        <ServiceTable number="08" seats={4} state="turning" time="12 min" shape="long" className="left-[34%] top-[35%] h-[62px] w-[96px]" />
        <ServiceTable number="06" seats={4} state="seated" guest="Luca" time="68 min" className="bottom-[4%] left-[4%] w-[72px]" />
        <ServiceTable number="09" seats={2} state="available" className="bottom-[2%] right-[7%] w-[66px]" />
      </div>

      <div className="absolute inset-x-6 bottom-5 top-[76px] hidden sm:block">
        <div className="absolute inset-y-0 left-[48%] border-l border-dashed border-white/[0.07]" />
        <span className="absolute bottom-1 left-[49.5%] text-[8px] uppercase tracking-[0.15em] text-white/[0.22]">{t('landing.launch.passage', 'Passage')}</span>
        <ServiceTable number="02" seats={2} state="seated" guest="Maya" time="42 min" className="left-[3%] top-[3%] w-[82px]" />
        <ServiceTable number="03" seats={2} state="reserved" time="20:45" className="left-[32%] top-[2%] w-[78px]" />
        <ServiceTable number="04" seats={4} state="available" className="right-[23%] top-[4%] w-[88px]" />
        <ServiceTable number="05" seats={6} state="seated" guest="Noa" time="76 min" shape="long" className="right-[1%] top-[38%] h-[72px] w-[116px]" />
        <ServiceTable number="08" seats={4} state="turning" time="12 min" shape="long" className="left-[20%] top-[42%] h-[72px] w-[112px]" />
        <ServiceTable number="06" seats={4} state="seated" guest="Luca" time="68 min" className="bottom-[1%] left-[1%] w-[88px]" />
        <ServiceTable number="09" seats={2} state="available" className="bottom-[2%] left-[55%] w-[76px]" />
        <ServiceTable number="11" seats={6} state="reserved" time="21:00" shape="long" className="bottom-[1%] right-[1%] h-[66px] w-[126px]" />
      </div>
    </div>
  );
}

export default function LiveServiceCanvas() {
  const { t } = useTranslation();
  const metrics = [
    [t('landing.launch.covers', 'Covers'), '86'],
    [t('landing.launch.occupancy', 'Occupancy'), '78%'],
    [t('landing.launch.nextTurn', 'Next turn'), `12 ${t('landing.launch.minutes', 'min')}`],
  ];

  return (
    <section className="overflow-hidden rounded-[26px] bg-[#151311] text-white shadow-[0_32px_90px_rgba(28,25,23,.24)] sm:rounded-[34px]" aria-label={t('landing.launch.canvasAria', 'Illustrative live service dashboard')}>
      <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-white/10 px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#EEE6D8]"><ThiingsIcon name="utensils" pxSize={16} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium tracking-[-0.02em]">{t('landing.launch.serviceTitle', 'Friday dinner service')}</p>
            <p className="mt-0.5 text-[10px] text-white/60">{t('landing.launch.demoData', 'Illustrative service scenario')}</p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-white/60">{t('landing.launch.live', 'Service view')} · 20:18</span>
      </header>

      <div className="grid grid-cols-3 border-b border-white/10">
        {metrics.map(([label, value], index) => (
          <div key={label} className={`px-4 py-4 sm:px-7 sm:py-5 ${index > 0 ? 'border-l border-white/10' : ''}`}>
            <p className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/60 sm:text-[10px]">{label}</p>
            <p className="mt-1.5 text-lg font-medium tabular-nums tracking-[-0.04em] sm:text-2xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_310px]">
        <FloorPlan />
        <ReservationRail />
      </div>
    </section>
  );
}
