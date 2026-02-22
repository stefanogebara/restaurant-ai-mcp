import type { TableShape, TableStatus } from '../../types/host.types';
import { colors as tc } from '../../utils/colors';

interface TableRendererProps {
  shape: TableShape;
  capacity: number;
  width: number;  // pixels
  height: number; // pixels
  status: TableStatus;
  tableNumber: string;
  isSelected?: boolean;
  // NEW props for industry-standard design
  guestName?: string;           // Show on occupied tables
  isVIP?: boolean;              // Golden star indicator
  specialOccasion?: string;     // Birthday, Anniversary, etc.
  serverColor?: string;         // Server section color
  darkMode?: boolean;           // Dark mode styling
}

// Status-based color schemes - outline-based design (like SevenRooms)
// Light mode: neutral fill with colored outline
const LIGHT_STATUS_COLORS: Record<TableStatus, { fill: string; stroke: string; strokeWidth: number; chairFill: string }> = {
  'Available': { fill: tc.warmWhite, stroke: '#22c55e', strokeWidth: 3, chairFill: '#e5e5e5' },
  'Occupied': { fill: tc.warmWhite, stroke: '#ef4444', strokeWidth: 3, chairFill: '#e5e5e5' },
  'Reserved': { fill: tc.warmWhite, stroke: '#a855f7', strokeWidth: 3, chairFill: '#e5e5e5' },
  'Being Cleaned': { fill: tc.warmWhite, stroke: '#f59e0b', strokeWidth: 3, chairFill: '#e5e5e5' },
};

// Dark mode colors
const DARK_STATUS_COLORS: Record<TableStatus, { fill: string; stroke: string; strokeWidth: number; chairFill: string }> = {
  'Available': { fill: tc.charcoalDark, stroke: '#4ade80', strokeWidth: 3, chairFill: '#44403C' },
  'Occupied': { fill: tc.charcoalDark, stroke: '#f87171', strokeWidth: 3, chairFill: '#44403C' },
  'Reserved': { fill: tc.charcoalDark, stroke: '#c084fc', strokeWidth: 3, chairFill: '#44403C' },
  'Being Cleaned': { fill: tc.charcoalDark, stroke: '#fbbf24', strokeWidth: 3, chairFill: '#44403C' },
};

// Get colors based on dark mode
const getColors = (status: TableStatus, darkMode: boolean = false) => {
  const colors = darkMode ? DARK_STATUS_COLORS : LIGHT_STATUS_COLORS;
  return colors[status] || colors['Available'];
};

// Chair component
interface ChairProps {
  x: number;
  y: number;
  size: number;
  fill: string;
}

function Chair({ x, y, size, fill, darkMode = false }: ChairProps & { darkMode?: boolean }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={size / 2}
      fill={fill}
      stroke={darkMode ? tc.stoneGray : tc.mutedStone}
      strokeWidth="1"
    />
  );
}

// Chair layout based on shape and capacity
interface ChairLayoutProps {
  shape: TableShape;
  capacity: number;
  width: number;
  height: number;
  chairFill: string;
  tableRadius?: number;
  tablePadding?: number;
  darkMode?: boolean;
}

function ChairLayout({ shape, capacity, width, height, chairFill, tableRadius, tablePadding = 4, darkMode = false }: ChairLayoutProps) {
  const chairs: { x: number; y: number }[] = [];
  const chairSize = Math.min(14, Math.min(width, height) / 5);  // Larger chairs for bigger tables

  if (shape === 'round') {
    // Chairs evenly spaced around circle
    const cx = width / 2;
    const cy = height / 2;
    const radius = (tableRadius || Math.min(width, height) / 2 - 8) + chairSize / 2 + 2;

    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      chairs.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }
  } else if (shape === 'square') {
    // Chairs on 4 sides of square
    const tableSize = Math.min(width, height) - tablePadding * 2 - chairSize - 4;
    const startX = (width - tableSize) / 2;
    const startY = (height - tableSize) / 2;

    const perSide = Math.ceil(capacity / 4);
    const sides = [
      { dir: 'top', count: Math.min(perSide, capacity) },
      { dir: 'right', count: Math.min(perSide, Math.max(0, capacity - perSide)) },
      { dir: 'bottom', count: Math.min(perSide, Math.max(0, capacity - perSide * 2)) },
      { dir: 'left', count: Math.max(0, capacity - perSide * 3) },
    ];

    sides.forEach(({ dir, count }) => {
      for (let i = 0; i < count; i++) {
        const offset = tableSize / (count + 1) * (i + 1);
        if (dir === 'top') {
          chairs.push({ x: startX + offset, y: startY - chairSize / 2 - 2 });
        } else if (dir === 'bottom') {
          chairs.push({ x: startX + offset, y: startY + tableSize + chairSize / 2 + 2 });
        } else if (dir === 'left') {
          chairs.push({ x: startX - chairSize / 2 - 2, y: startY + offset });
        } else {
          chairs.push({ x: startX + tableSize + chairSize / 2 + 2, y: startY + offset });
        }
      }
    });
  } else if (shape === 'rectangle' || shape === 'oval') {
    // Chairs on long sides
    const sideChairs = Math.ceil(capacity / 2);
    const padding = 8;
    const tableWidth = width - padding * 2 - chairSize;
    const startX = padding + chairSize / 2;

    for (let i = 0; i < sideChairs; i++) {
      const x = startX + (tableWidth / (sideChairs)) * (i + 0.5);
      // Top side
      chairs.push({ x, y: padding });
      // Bottom side (if we have enough chairs)
      if (chairs.length < capacity) {
        chairs.push({ x, y: height - padding });
      }
    }
  } else if (shape === 'booth') {
    // Chairs only on open side (bottom)
    const padding = 8;
    const tableWidth = width - padding * 2 - chairSize;
    const startX = padding + chairSize / 2;

    for (let i = 0; i < capacity; i++) {
      const x = startX + (tableWidth / (capacity)) * (i + 0.5);
      chairs.push({ x, y: height - padding });
    }
  } else if (shape === 'bar-stool') {
    // Single chair below the stool indicator
    chairs.push({ x: width / 2, y: height - 6 });
  }

  return (
    <>
      {chairs.map((chair, i) => (
        <Chair key={i} x={chair.x} y={chair.y} size={chairSize} fill={chairFill} darkMode={darkMode} />
      ))}
    </>
  );
}

// Individual table shape components
interface ShapeProps {
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  padding?: number;
}

function RoundTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - padding;

  return (
    <>
      <defs>
        <linearGradient id="tableGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor={fill} style={{ filter: 'brightness(0.95)' }} />
        </linearGradient>
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter="url(#shadow)"
      />
    </>
  );
}

function SquareTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const size = Math.min(width, height) - padding * 2 - 8;
  const x = (width - size) / 2;
  const y = (height - size) / 2;

  return (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      rx="4"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      filter="url(#shadow)"
    />
  );
}

function RectangleTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const tableWidth = width - padding * 2 - 8;
  const tableHeight = height - padding * 2 - 8;
  const x = (width - tableWidth) / 2;
  const y = (height - tableHeight) / 2;

  return (
    <rect
      x={x}
      y={y}
      width={tableWidth}
      height={tableHeight}
      rx="4"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      filter="url(#shadow)"
    />
  );
}

function OvalTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = (width - padding * 2 - 8) / 2;
  const ry = (height - padding * 2 - 8) / 2;

  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      filter="url(#shadow)"
    />
  );
}

function BoothTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const boothHeight = height * 0.35;
  const tableTop = boothHeight + 4;
  const tableHeight = height - tableTop - padding - 8;
  const tableWidth = width - padding * 2 - 8;
  const x = (width - tableWidth) / 2;

  // Booth back path (curved)
  const boothPath = `
    M ${padding + 4},${boothHeight}
    L ${padding + 4},${padding + 8}
    Q ${padding + 4},${padding + 4} ${padding + 12},${padding + 4}
    L ${width - padding - 12},${padding + 4}
    Q ${width - padding - 4},${padding + 4} ${width - padding - 4},${padding + 8}
    L ${width - padding - 4},${boothHeight}
  `;

  return (
    <>
      {/* Booth back (darker upholstery) */}
      <path
        d={boothPath}
        fill={tc.warmStone}
        stroke={tc.stoneGray}
        strokeWidth="2"
        filter="url(#shadow)"
      />
      {/* Table surface */}
      <rect
        x={x}
        y={tableTop}
        width={tableWidth}
        height={tableHeight}
        rx="4"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter="url(#shadow)"
      />
    </>
  );
}

function BarStoolTable({ width, height, fill, stroke, strokeWidth = 3 }: ShapeProps) {
  const cx = width / 2;
  const cy = height / 2 - 4;
  const r = Math.min(width, height) / 3.5;

  return (
    <>
      {/* Stool base ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r + 3}
        fill="none"
        stroke="#a8a29e"
        strokeWidth="2"
      />
      {/* Seat */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter="url(#shadow)"
      />
    </>
  );
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

  // Calculate text positioning - larger fonts for better visibility
  const textY = shape === 'booth' ? height * 0.55 : height / 2;
  const fontSize = Math.min(24, Math.min(width, height) / 2.5);  // Bold prominent table numbers
  const capacityFontSize = Math.min(14, fontSize * 0.55);  // Smaller capacity text below

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      {/* Shadow filter */}
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

      {/* Selection glow background */}
      {isSelected && (
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="transparent"
          filter="url(#selectedGlow)"
        />
      )}

      {/* Chairs (rendered behind table) */}
      <ChairLayout
        shape={shape}
        capacity={capacity}
        width={width}
        height={height}
        chairFill={colors.chairFill}
        tableRadius={shape === 'round' ? Math.min(width, height) / 2 - 8 : undefined}
        darkMode={darkMode}
      />

      {/* Table body based on shape */}
      {shape === 'round' && <RoundTable {...shapeProps} />}
      {shape === 'square' && <SquareTable {...shapeProps} />}
      {shape === 'rectangle' && <RectangleTable {...shapeProps} />}
      {shape === 'oval' && <OvalTable {...shapeProps} />}
      {shape === 'booth' && <BoothTable {...shapeProps} />}
      {shape === 'bar-stool' && <BarStoolTable {...shapeProps} />}

      {/* VIP indicator - golden star badge in top-right */}
      {isVIP && (
        <g transform={`translate(${width - 14}, 2)`}>
          <circle cx="6" cy="6" r="7" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
          <text x="6" y="9" textAnchor="middle" fontSize="8" fill={tc.deepCharcoal}>★</text>
        </g>
      )}

      {/* Special occasion indicator - emoji badge in top-left */}
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

      {/* Both VIP and special occasion */}
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

      {/* Server section indicator */}
      {serverColor && (
        <g transform={`translate(${width / 2 - 8}, ${height - 12})`}>
          <rect x="0" y="0" width="16" height="8" rx="2" fill={serverColor} />
        </g>
      )}

      {/* Table content - show guest name for occupied tables */}
      {status === 'Occupied' && guestName ? (
        <>
          {/* Guest first name (primary) */}
          <text
            x={width / 2}
            y={textY - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.min(10, fontSize)}
            fontWeight="600"
            fill={darkMode ? tc.warmWhite : tc.deepCharcoal}
            style={{ pointerEvents: 'none' }}
          >
            {guestName.split(' ')[0].substring(0, 8)}
          </text>
          {/* Table number (secondary, smaller) */}
          <text
            x={width / 2}
            y={textY + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.min(8, capacityFontSize)}
            fill={darkMode ? tc.mutedStone : tc.stoneGray}
            style={{ pointerEvents: 'none' }}
          >
            T{tableNumber}
          </text>
        </>
      ) : tableNumber ? (
        <>
          {/* Standard display: table number + capacity */}
          <text
            x={width / 2}
            y={textY - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight="bold"
            fill={darkMode ? tc.warmWhite : tc.deepCharcoal}
            style={{ pointerEvents: 'none' }}
          >
            {tableNumber}
          </text>
          <text
            x={width / 2}
            y={textY + fontSize - 2}
            textAnchor="middle"
            dominantBaseline="middle"
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

// Preview version for palette (smaller, no table number)
interface TablePreviewProps {
  shape: TableShape;
  capacity: number;
  width?: number;
  height?: number;
}

export function TablePreview({ shape, capacity, width = 48, height = 48 }: TablePreviewProps) {
  return (
    <TableRenderer
      shape={shape}
      capacity={capacity}
      width={width}
      height={height}
      status="Available"
      tableNumber=""
    />
  );
}

export default TableRenderer;
