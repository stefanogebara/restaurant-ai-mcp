import React from 'react';
import type { TableShape, TableStatus } from '../../types/host.types';

interface TableRendererProps {
  shape: TableShape;
  capacity: number;
  width: number;  // pixels
  height: number; // pixels
  status: TableStatus;
  tableNumber: string;
  isSelected?: boolean;
  isUnpositioned?: boolean;
}

// Status-based color schemes
const STATUS_COLORS: Record<TableStatus, { fill: string; stroke: string; glow: string; chairFill: string }> = {
  'Available': { fill: '#dcfce7', stroke: '#22c55e', glow: '#22c55e40', chairFill: '#bbf7d0' },
  'Occupied': { fill: '#fee2e2', stroke: '#ef4444', glow: '#ef444440', chairFill: '#fecaca' },
  'Reserved': { fill: '#f3e8ff', stroke: '#a855f7', glow: '#a855f740', chairFill: '#e9d5ff' },
  'Being Cleaned': { fill: '#fef3c7', stroke: '#f59e0b', glow: '#f59e0b40', chairFill: '#fde68a' },
};

// Chair component
interface ChairProps {
  x: number;
  y: number;
  size: number;
  fill: string;
}

function Chair({ x, y, size, fill }: ChairProps) {
  return (
    <circle
      cx={x}
      cy={y}
      r={size / 2}
      fill={fill}
      stroke="#a8a29e"
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
}

function ChairLayout({ shape, capacity, width, height, chairFill, tableRadius, tablePadding = 4 }: ChairLayoutProps) {
  const chairs: { x: number; y: number }[] = [];
  const chairSize = Math.min(10, Math.min(width, height) / 6);

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
    const padding = tablePadding + chairSize / 2 + 2;
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
        <Chair key={i} x={chair.x} y={chair.y} size={chairSize} fill={chairFill} />
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
  padding?: number;
}

function RoundTable({ width, height, fill, stroke, padding = 8 }: ShapeProps) {
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
        strokeWidth="2"
        filter="url(#shadow)"
      />
    </>
  );
}

function SquareTable({ width, height, fill, stroke, padding = 8 }: ShapeProps) {
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
      strokeWidth="2"
      filter="url(#shadow)"
    />
  );
}

function RectangleTable({ width, height, fill, stroke, padding = 8 }: ShapeProps) {
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
      strokeWidth="2"
      filter="url(#shadow)"
    />
  );
}

function OvalTable({ width, height, fill, stroke, padding = 8 }: ShapeProps) {
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
      strokeWidth="2"
      filter="url(#shadow)"
    />
  );
}

function BoothTable({ width, height, fill, stroke, padding = 8 }: ShapeProps) {
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
        fill="#78716c"
        stroke="#57534E"
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
        strokeWidth="2"
        filter="url(#shadow)"
      />
    </>
  );
}

function BarStoolTable({ width, height, fill, stroke }: ShapeProps) {
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
        strokeWidth="2"
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
  isUnpositioned,
}: TableRendererProps) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['Available'];
  const shapeProps: ShapeProps = {
    width,
    height,
    fill: colors.fill,
    stroke: colors.stroke,
  };

  // Calculate text positioning
  const textY = shape === 'booth' ? height * 0.55 : height / 2;
  const fontSize = Math.min(12, Math.min(width, height) / 4);
  const capacityFontSize = Math.min(9, fontSize * 0.75);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Shadow filter */}
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.15" />
        </filter>
        {isSelected && (
          <filter id="selectedGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#9F1239" floodOpacity="0.6" />
          </filter>
        )}
        {isUnpositioned && (
          <filter id="unpositionedGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f97316" floodOpacity="0.5" />
          </filter>
        )}
      </defs>

      {/* Selection/unpositioned glow background */}
      {(isSelected || isUnpositioned) && (
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="transparent"
          filter={isSelected ? "url(#selectedGlow)" : "url(#unpositionedGlow)"}
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
      />

      {/* Table body based on shape */}
      {shape === 'round' && <RoundTable {...shapeProps} />}
      {shape === 'square' && <SquareTable {...shapeProps} />}
      {shape === 'rectangle' && <RectangleTable {...shapeProps} />}
      {shape === 'oval' && <OvalTable {...shapeProps} />}
      {shape === 'booth' && <BoothTable {...shapeProps} />}
      {shape === 'bar-stool' && <BarStoolTable {...shapeProps} />}

      {/* Table number */}
      {tableNumber && (
        <>
          <text
            x={width / 2}
            y={textY - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight="bold"
            fill="#1C1917"
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
            fill="#57534E"
            style={{ pointerEvents: 'none' }}
          >
            {capacity}p
          </text>
        </>
      )}
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
