import { useTranslation } from 'react-i18next';
import type { Table } from '../../types/host.types';
import { getStatusStyle, statusLabel } from './floorPlanHelpers';
import type { PartyInfo } from './floorPlanHelpers';
import { formatTime } from './floorPlanHelpers';
import { getShapeLabelKey } from '../floor-plan/floorPlanConstants';

interface HoverCardProps {
  table: Table;
  party?: PartyInfo;
  x: number;
  y: number;
  w: number;
  h: number;
  svgW: number;
  allTables?: Table[];
}

export default function FloorPlanHoverCard({
  table, party, x, y, w, h, svgW, allTables,
}: HoverCardProps) {
  const { t } = useTranslation();
  const st = getStatusStyle(table.status);
  const isOccupied = table.status?.toLowerCase() === 'occupied' && party;

  const joinableNames = (table.is_joinable && table.joinable_with?.length > 0 && allTables)
    ? table.joinable_with
        .map(id => allTables.find(t => t.id === id))
        .filter(Boolean)
        .map(t => t!.table_number)
    : [];
  const combinedCapacity = joinableNames.length > 0 && allTables
    ? (table.capacity || 0) + table.joinable_with
        .map(id => allTables.find(t => t.id === id))
        .filter(Boolean)
        .reduce((sum, t) => sum + (t!.capacity || 0), 0)
    : 0;
  const hasJoinable = joinableNames.length > 0;

  const cardW = 204;
  const cardH = isOccupied ? (hasJoinable ? 150 : 120) : (hasJoinable ? 108 : 78);
  const cx = x + w / 2;

  const showBelow = y < cardH + 24;
  const cardX = Math.max(6, Math.min(cx - cardW / 2, svgW - cardW - 6));
  const cardY = showBelow ? y + h + 18 : y - cardH - 18;

  const total = party ? party.timeElapsed + party.timeRemaining : 0;
  const pct = party ? (party.isOverdue ? 100 : (total > 0 ? Math.min((party.timeElapsed / total) * 100, 100) : 0)) : 0;
  let barColor = '#9F1239';
  if (party?.isOverdue) barColor = '#E11D48';
  else if (pct > 75) barColor = '#D97706';

  return (
    <foreignObject
      x={cardX} y={cardY} width={cardW} height={cardH + 4}
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      <div style={{
        background: '#fff',
        border: '1px solid #E7E5E4',
        borderRadius: 14,
        padding: '10px 13px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05)',
        fontFamily: 'Inter,-apple-system,sans-serif',
        color: '#1C1917',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {t('floorPlan.tableLabel', 'Table')} {table.table_number}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
            background: st.fill, color: st.text, border: `1px solid ${st.stroke}`,
          }}>
            {statusLabel(table.status, (k, f) => t(k, { defaultValue: f ?? k }))}
          </span>
        </div>

        <div style={{ color: '#78716C', fontSize: 11, marginTop: 2 }}>
          {table.capacity} {t('floorPlan.seats', 'seats')} &middot;{' '}
          {t(getShapeLabelKey(table.shape))}{' '}
          &middot; {t(`floorPlan.location.${(table.location || 'Indoor').toLowerCase()}`, table.location || 'Indoor')}
        </div>

        {isOccupied && party && (
          <>
            <div style={{ marginTop: 7, fontWeight: 600, fontSize: 12 }}>
              {party.guestName} &middot; {party.partySize} {t('floorPlan.guests', 'guests')}
            </div>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                flex: 1, height: 4, borderRadius: 2, background: '#E7E5E4', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 2,
                  background: barColor, transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: 10, color: '#78716C', whiteSpace: 'nowrap' }}>
                {party.isOverdue ? t('floorPlan.overdue', 'Overdue') : `${formatTime(party.timeRemaining)} ${t('floorPlan.left', 'left')}`}
              </span>
            </div>
          </>
        )}

        {hasJoinable && (
          <div style={{
            marginTop: 6, paddingTop: 6,
            borderTop: '1px solid #E7E5E4',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: '#78716C',
          }}>
            <span style={{ fontSize: 12 }}>&#x1F517;</span>
            <span>
              {t('floorPlan.joinWith', 'Join w/ Table')} {joinableNames.join(', ')} &middot; {combinedCapacity} {t('floorPlan.seats', 'seats')}
            </span>
          </div>
        )}
      </div>
    </foreignObject>
  );
}
