import type { TableShape } from '../../types/host.types';
import { colors as tc } from '../../utils/colors';

export interface ShapeProps {
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  padding?: number;
}

interface ChairProps {
  x: number;
  y: number;
  size: number;
  fill: string;
  darkMode?: boolean;
}

export function Chair({ x, y, size, fill, darkMode = false }: ChairProps) {
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

export function ChairLayout({ shape, capacity, width, height, chairFill, tableRadius, tablePadding = 4, darkMode = false }: ChairLayoutProps) {
  const chairs: { x: number; y: number }[] = [];
  const chairSize = Math.min(14, Math.min(width, height) / 5);

  if (shape === 'round') {
    const cx = width / 2;
    const cy = height / 2;
    const radius = (tableRadius || Math.min(width, height) / 2 - 8) + chairSize / 2 + 2;
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      chairs.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
  } else if (shape === 'square') {
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
        const offset = (tableSize / (count + 1)) * (i + 1);
        if (dir === 'top') chairs.push({ x: startX + offset, y: startY - chairSize / 2 - 2 });
        else if (dir === 'bottom') chairs.push({ x: startX + offset, y: startY + tableSize + chairSize / 2 + 2 });
        else if (dir === 'left') chairs.push({ x: startX - chairSize / 2 - 2, y: startY + offset });
        else chairs.push({ x: startX + tableSize + chairSize / 2 + 2, y: startY + offset });
      }
    });
  } else if (shape === 'rectangle' || shape === 'oval') {
    const sideChairs = Math.ceil(capacity / 2);
    const padding = 8;
    const tableWidth = width - padding * 2 - chairSize;
    const startX = padding + chairSize / 2;
    for (let i = 0; i < sideChairs; i++) {
      const x = startX + (tableWidth / sideChairs) * (i + 0.5);
      chairs.push({ x, y: padding });
      if (chairs.length < capacity) chairs.push({ x, y: height - padding });
    }
  } else if (shape === 'booth') {
    const padding = 8;
    const tableWidth = width - padding * 2 - chairSize;
    const startX = padding + chairSize / 2;
    for (let i = 0; i < capacity; i++) {
      chairs.push({ x: startX + (tableWidth / capacity) * (i + 0.5), y: height - padding });
    }
  } else if (shape === 'bar-stool') {
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

export function RoundTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
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
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter="url(#shadow)" />
    </>
  );
}

export function SquareTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const size = Math.min(width, height) - padding * 2 - 8;
  return (
    <rect
      x={(width - size) / 2}
      y={(height - size) / 2}
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

export function RectangleTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const tableWidth = width - padding * 2 - 8;
  const tableHeight = height - padding * 2 - 8;
  return (
    <rect
      x={(width - tableWidth) / 2}
      y={(height - tableHeight) / 2}
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

export function OvalTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  return (
    <ellipse
      cx={width / 2}
      cy={height / 2}
      rx={(width - padding * 2 - 8) / 2}
      ry={(height - padding * 2 - 8) / 2}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      filter="url(#shadow)"
    />
  );
}

export function BoothTable({ width, height, fill, stroke, strokeWidth = 3, padding = 8 }: ShapeProps) {
  const boothHeight = height * 0.35;
  const tableTop = boothHeight + 4;
  const tableHeight = height - tableTop - padding - 8;
  const tableWidth = width - padding * 2 - 8;
  const x = (width - tableWidth) / 2;
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
      <path d={boothPath} fill={tc.warmStone} stroke={tc.stoneGray} strokeWidth="2" filter="url(#shadow)" />
      <rect x={x} y={tableTop} width={tableWidth} height={tableHeight} rx="4" fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter="url(#shadow)" />
    </>
  );
}

export function BarStoolTable({ width, height, fill, stroke, strokeWidth = 3 }: ShapeProps) {
  const cx = width / 2;
  const cy = height / 2 - 4;
  const r = Math.min(width, height) / 3.5;
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="#a8a29e" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter="url(#shadow)" />
    </>
  );
}
