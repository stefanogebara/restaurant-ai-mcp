import type { Table, TableShape } from '../../types/host.types';
import { getStatusStyle as getMesaStyle, type StatusStyle } from '../host/floorPlanHelpers';
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

// Derived from the ONE mesa palette in floorPlanHelpers — the editor and the
// dashboard draw the same restaurant. Before this, the editor kept its own
// copy (available emerald, reserved violet) so a host saw two different
// colour languages for the same table depending on which screen they opened.
export const STATUS_STYLES: Record<string, StatusStyle> = {
  available: getMesaStyle('available'),
  occupied:  getMesaStyle('occupied'),
  reserved:  getMesaStyle('reserved'),
  cleaning:  getMesaStyle('being cleaned'),
  default:   getMesaStyle(''),
};

export const getStatusKey = (status: string): string => {
  const s = status?.toLowerCase() || '';
  if (s === 'being cleaned') return 'cleaning';
  if (STATUS_STYLES[s]) return s;
  return 'default';
};

export const getStatusStyle = (status: string): StatusStyle =>
  STATUS_STYLES[getStatusKey(status)] ?? STATUS_STYLES.default;

// ── Table sizing ──────────────────────────────────────────────────────────────

export function getTablePxSize(table: Table) {
  const shape = (table.shape?.toLowerCase() || 'round') as TableShape;
  const gridSize = getTableGridSize(shape, table.capacity || 2);
  return { w: gridSize.width * CELL, h: gridSize.height * CELL };
}

/**
 * Snap a pixel position to the grid. tableW/tableH are the table's footprint
 * in grid cells — the snapped cell is clamped so a multi-cell table (rectangle,
 * booth) can't be saved hanging off the right/bottom edge of the grid.
 */
export const snapToGrid = (px: number, py: number, tableW = 1, tableH = 1) => ({
  gx: Math.max(0, Math.min(GRID_COLS - tableW, Math.round(px / CELL))),
  gy: Math.max(0, Math.min(GRID_ROWS - tableH, Math.round(py / CELL))),
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

// Raw table.shape value → floorPlan.shape.* i18n key. Covers legacy/aliased
// shapes ('circle' → round, 'oval' → rectangle) not offered in the picker.
const SHAPE_I18N_KEY: Record<string, string> = {
  round: 'round',
  circle: 'round',
  square: 'square',
  rectangle: 'rectangle',
  oval: 'rectangle',
  booth: 'booth',
  'bar-stool': 'barStool',
};

/** i18n key under floorPlan.shape.* for a raw table.shape value. */
export function getShapeLabelKey(shape?: string | null): string {
  const key = SHAPE_I18N_KEY[(shape || 'round').toLowerCase()] ?? 'round';
  return `floorPlan.shape.${key}`;
}
