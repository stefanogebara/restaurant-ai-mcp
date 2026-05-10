import type { Table, TableShape } from '../../types/host.types';
import { getTableSize as getTableGridSize } from '../../types/host.types';

// ── Grid ─────────────────────────────────────────────────────────────────────

export const CELL = 40;
export const GRID_COLS = 24;
export const GRID_ROWS = 20;
export const SVG_W = CELL * GRID_COLS;
export const SVG_H = CELL * GRID_ROWS;
export const TABLE_VISUAL_SCALE = 1.3;

// ── Animations ────────────────────────────────────────────────────────────────

export const EDITOR_CSS = `
  @keyframes fpLinkDash { to { stroke-dashoffset: -20 } }
  @keyframes linkPulse { 0%,100% { opacity:0.6 } 50% { opacity:1 } }
  .link-active { animation: linkPulse 1.2s ease-in-out infinite }
`;

// ── Status palette ────────────────────────────────────────────────────────────

export const STATUS_STYLES: Record<string, {
  fill: string; stroke: string; text: string; chairFill: string;
}> = {
  available: { fill: '#ECFDF5', stroke: '#9F1239', text: '#064E3B', chairFill: '#9F1239' },
  occupied:  { fill: '#FFF1F2', stroke: '#E11D48', text: '#881337', chairFill: '#E11D48' },
  reserved:  { fill: '#F5F3FF', stroke: '#7C3AED', text: '#3730A3', chairFill: '#7C3AED' },
  cleaning:  { fill: '#FFFBEB', stroke: '#D97706', text: '#78350F', chairFill: '#D97706' },
  default:   { fill: '#FAFAF9', stroke: '#A8A29E', text: '#57534E', chairFill: '#A8A29E' },
};

export const getStatusKey = (status: string): string => {
  const s = status?.toLowerCase() || '';
  if (s === 'being cleaned') return 'cleaning';
  if (STATUS_STYLES[s]) return s;
  return 'default';
};

export const getStatusStyle = (status: string) =>
  STATUS_STYLES[getStatusKey(status)] ?? STATUS_STYLES.default;

// ── Table sizing ──────────────────────────────────────────────────────────────

export function getTablePxSize(table: Table) {
  const shape = (table.shape?.toLowerCase() || 'round') as TableShape;
  const gridSize = getTableGridSize(shape, table.capacity || 2);
  return { w: gridSize.width * CELL, h: gridSize.height * CELL };
}

export const snapToGrid = (px: number, py: number) => ({
  gx: Math.max(0, Math.min(GRID_COLS - 1, Math.round(px / CELL))),
  gy: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(py / CELL))),
});

// ── Shape / capacity options ──────────────────────────────────────────────────

// i18nKey maps to floorPlan.shape.{i18nKey} in the locale files.
// label is the canonical English fallback if the key is missing.
export const SHAPES: { value: TableShape; i18nKey: string; label: string }[] = [
  { value: 'round',     i18nKey: 'round',     label: 'Round' },
  { value: 'square',    i18nKey: 'square',    label: 'Square' },
  { value: 'rectangle', i18nKey: 'rectangle', label: 'Rectangle' },
  { value: 'booth',     i18nKey: 'booth',     label: 'Booth' },
  { value: 'bar-stool', i18nKey: 'barStool',  label: 'Bar Stool' },
];

export const CAPACITIES = [2, 4, 6, 8, 10];

// ── Legend items ──────────────────────────────────────────────────────────────

export const LEGEND_ITEMS = [
  { key: 'available', label: 'Available', stroke: '#9F1239', fill: '#ECFDF5' },
  { key: 'occupied',  label: 'Occupied',  stroke: '#E11D48', fill: '#FFF1F2' },
  { key: 'reserved',  label: 'Reserved',  stroke: '#7C3AED', fill: '#F5F3FF' },
  { key: 'cleaning',  label: 'Cleaning',  stroke: '#D97706', fill: '#FFFBEB' },
];
