import { useTranslation } from 'react-i18next';
import TableStatusLegend from '../host/TableStatusLegend';

/**
 * Editor legend = the dashboard legend (same swatches, same palette) plus the
 * linked-tables affordance, which only the editor can create.
 */
export default function FloorPlanLegend() {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
      <TableStatusLegend />

      <div className="flex items-center gap-2 ml-auto">
        <svg width="22" height="8" className="flex-shrink-0" aria-hidden="true">
          <line x1="0" y1="4" x2="22" y2="4"
            stroke="#9F1239" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
        </svg>
        <span className="text-xs text-warm-stone font-medium">{t('floorPlan.linkedTables', 'Linked tables')}</span>
      </div>
    </div>
  );
}
