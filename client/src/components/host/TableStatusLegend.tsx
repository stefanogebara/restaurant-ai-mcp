import { useTranslation } from 'react-i18next';
import { getStatusStyle } from './floorPlanHelpers';

/**
 * Mesa status legend — draws the SAME swatch the floor draws.
 *
 * History: this used to delegate to the semantic <StatusLegend /> (emerald /
 * blue / amber / stone dots). Once the tables became illustrated (occupied =
 * solid burgundy with plates, reserved = dashed amber, free = glass), those
 * dots described colours that appear nowhere on the floor. A legend that
 * disagrees with the drawing is worse than no legend, so it now derives every
 * swatch from the one palette in floorPlanHelpers.
 */
const STATUSES: { status: string; labelKey: string; fallback: string }[] = [
  { status: 'available',     labelKey: 'settings.tableStatus.available', fallback: 'Available' },
  { status: 'occupied',      labelKey: 'settings.tableStatus.occupied',  fallback: 'Occupied' },
  { status: 'reserved',      labelKey: 'settings.tableStatus.reserved',  fallback: 'Reserved' },
  { status: 'being cleaned', labelKey: 'settings.tableStatus.cleaning',  fallback: 'Cleaning' },
];

interface TableStatusLegendProps {
  /** Modo Serviço — swatches switch to the night palette. */
  night?: boolean;
  className?: string;
}

export default function TableStatusLegend({ night = false, className = '' }: TableStatusLegendProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-x-4 gap-y-2 flex-wrap ${className}`}>
      <span className={`text-xs font-medium ${night ? 'text-white/55' : 'text-stone-gray'}`}>
        {t('settings.tableStatusLabel', 'Status')}
      </span>
      {STATUSES.map(({ status, labelKey, fallback }) => {
        const st = getStatusStyle(status, night);
        return (
          <div key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{
                background: st.fill,
                border: `1.5px ${st.dash ? 'dashed' : 'solid'} ${st.stroke}`,
              }}
            />
            <span className={`text-xs ${night ? 'text-white/55' : 'text-stone-gray'}`}>
              {t(labelKey, fallback)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
