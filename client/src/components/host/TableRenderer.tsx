import type { TableShape, TableStatus } from '../../types/host.types';
import { colors as tc } from '../../utils/colors';
import { getColors } from '../../utils/tableRendererColors';
import {
  ChairLayout,
  RoundTable,
  SquareTable,
  RectangleTable,
  OvalTable,
  BoothTable,
  BarStoolTable,
  type ShapeProps,
} from './tableRendererShapes';

interface TableRendererProps {
  shape: TableShape;
  capacity: number;
  width: number;
  height: number;
  status: TableStatus;
  tableNumber: string;
  isSelected?: boolean;
  guestName?: string;
  isVIP?: boolean;
  specialOccasion?: string;
  serverColor?: string;
  darkMode?: boolean;
}

export function TableRenderer({
  shape,
  capacity,
  width,
  height,
  status,
  tableNumber,
  isSelected,
  guestName,
  isVIP,
  specialOccasion,
  serverColor,
  darkMode = false,
}: TableRendererProps) {
  const colors = getColors(status, darkMode);
  const shapeProps: ShapeProps = {
    width,
    height,
    fill: colors.fill,
    stroke: colors.stroke,
    strokeWidth: colors.strokeWidth,
  };

  const textY = shape === 'booth' ? height * 0.55 : height / 2;
  const fontSize = Math.min(24, Math.min(width, height) / 2.5);
  const capacityFontSize = Math.min(14, fontSize * 0.55);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.15" />
        </filter>
        {isSelected && (
          <filter id="selectedGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={tc.burgundy} floodOpacity="0.6" />
          </filter>
        )}
      </defs>

      {isSelected && (
        <rect x="0" y="0" width={width} height={height} fill="transparent" filter="url(#selectedGlow)" />
      )}

      <ChairLayout
        shape={shape}
        capacity={capacity}
        width={width}
        height={height}
        chairFill={colors.chairFill}
        tableRadius={shape === 'round' ? Math.min(width, height) / 2 - 8 : undefined}
        darkMode={darkMode}
      />

      {shape === 'round' && <RoundTable {...shapeProps} />}
      {shape === 'square' && <SquareTable {...shapeProps} />}
      {shape === 'rectangle' && <RectangleTable {...shapeProps} />}
      {shape === 'oval' && <OvalTable {...shapeProps} />}
      {shape === 'booth' && <BoothTable {...shapeProps} />}
      {shape === 'bar-stool' && <BarStoolTable {...shapeProps} />}

      {isVIP && (
        <g transform={`translate(${width - 14}, 2)`}>
          <circle cx="6" cy="6" r="7" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
          <text x="6" y="9" textAnchor="middle" fontSize="8" fill={tc.deepCharcoal}>★</text>
        </g>
      )}

      {specialOccasion && !isVIP && (
        <g transform={`translate(2, 2)`}>
          <circle cx="6" cy="6" r="7" fill="#fce7f3" stroke="#f9a8d4" strokeWidth="1" />
          <text x="6" y="9" textAnchor="middle" fontSize="7">
            {specialOccasion === 'Birthday' ? '🎂' :
             specialOccasion === 'Anniversary' ? '💍' :
             specialOccasion === 'Business' ? '💼' : '✨'}
          </text>
        </g>
      )}

      {isVIP && specialOccasion && (
        <g transform={`translate(2, 2)`}>
          <circle cx="6" cy="6" r="7" fill="#fce7f3" stroke="#f9a8d4" strokeWidth="1" />
          <text x="6" y="9" textAnchor="middle" fontSize="7">
            {specialOccasion === 'Birthday' ? '🎂' :
             specialOccasion === 'Anniversary' ? '💍' :
             specialOccasion === 'Business' ? '💼' : '✨'}
          </text>
        </g>
      )}

      {serverColor && (
        <g transform={`translate(${width / 2 - 8}, ${height - 12})`}>
          <rect x="0" y="0" width="16" height="8" rx="2" fill={serverColor} />
        </g>
      )}

      {status === 'Occupied' && guestName ? (
        <>
          <text
            x={width / 2} y={textY - 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={Math.min(10, fontSize)} fontWeight="600"
            fill={darkMode ? tc.warmWhite : tc.deepCharcoal}
            style={{ pointerEvents: 'none' }}
          >
            {guestName.split(' ')[0].substring(0, 8)}
          </text>
          <text
            x={width / 2} y={textY + 10}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={Math.min(8, capacityFontSize)}
            fill={darkMode ? tc.mutedStone : tc.stoneGray}
            style={{ pointerEvents: 'none' }}
          >
            T{tableNumber}
          </text>
        </>
      ) : tableNumber ? (
        <>
          <text
            x={width / 2} y={textY - 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={fontSize} fontWeight="bold"
            fill={darkMode ? tc.warmWhite : tc.deepCharcoal}
            style={{ pointerEvents: 'none' }}
          >
            {tableNumber}
          </text>
          <text
            x={width / 2} y={textY + fontSize - 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={capacityFontSize}
            fill={darkMode ? tc.mutedStone : tc.stoneGray}
            style={{ pointerEvents: 'none' }}
          >
            {capacity}p
          </text>
        </>
      ) : null}
    </svg>
  );
}

interface TablePreviewProps {
  shape: TableShape;
  capacity: number;
  width?: number;
  height?: number;
}

export function TablePreview({ shape, capacity, width = 48, height = 48 }: TablePreviewProps) {
  return (
    <TableRenderer shape={shape} capacity={capacity} width={width} height={height} status="Available" tableNumber="" />
  );
}

export default TableRenderer;
