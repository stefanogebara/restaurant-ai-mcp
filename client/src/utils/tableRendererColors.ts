import type { TableStatus } from '../types/host.types';
import { colors as tc } from './colors';

type ColorScheme = { fill: string; stroke: string; strokeWidth: number; chairFill: string };

// Status-based color schemes - outline-based design (like SevenRooms)
// Light mode: neutral fill with colored outline
export const LIGHT_STATUS_COLORS: Record<TableStatus, ColorScheme> = {
  'Available': { fill: tc.warmWhite, stroke: '#22c55e', strokeWidth: 3, chairFill: '#e5e5e5' },
  'Occupied': { fill: tc.warmWhite, stroke: '#ef4444', strokeWidth: 3, chairFill: '#e5e5e5' },
  'Reserved': { fill: tc.warmWhite, stroke: '#a855f7', strokeWidth: 3, chairFill: '#e5e5e5' },
  'Being Cleaned': { fill: tc.warmWhite, stroke: '#f59e0b', strokeWidth: 3, chairFill: '#e5e5e5' },
};

// Dark mode colors
export const DARK_STATUS_COLORS: Record<TableStatus, ColorScheme> = {
  'Available': { fill: tc.charcoalDark, stroke: '#4ade80', strokeWidth: 3, chairFill: '#44403C' },
  'Occupied': { fill: tc.charcoalDark, stroke: '#f87171', strokeWidth: 3, chairFill: '#44403C' },
  'Reserved': { fill: tc.charcoalDark, stroke: '#c084fc', strokeWidth: 3, chairFill: '#44403C' },
  'Being Cleaned': { fill: tc.charcoalDark, stroke: '#fbbf24', strokeWidth: 3, chairFill: '#44403C' },
};

export function getColors(status: TableStatus, darkMode: boolean = false): ColorScheme {
  const colorMap = darkMode ? DARK_STATUS_COLORS : LIGHT_STATUS_COLORS;
  return colorMap[status] || colorMap['Available'];
}
