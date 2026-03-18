import React from 'react';
import type { Table } from '../../types/host.types';

export interface PartyInfo {
  guestName: string;
  partySize: number;
  isVIP?: boolean;
  specialOccasion?: string;
  timeElapsed: number;
  timeRemaining: number;
  isOverdue: boolean;
  seatedAt: string;
}

export interface StatusStyle {
  fill: string;
  stroke: string;
  text: string;
  chairFill: string;
  sublabel: string;
}

export const formatTime = (min: number): string => {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const statusLabel = (s: string) => {
  switch (s?.toLowerCase()) {
    case 'available':     return 'Available';
    case 'occupied':      return 'Occupied';
    case 'reserved':      return 'Reserved';
    case 'being cleaned': return 'Cleaning';
    default:              return s || 'Unknown';
  }
};

export const getStatusStyle = (status: string): StatusStyle => {
  switch (status?.toLowerCase()) {
    case 'available':
      return { fill: '#ECFDF5', stroke: '#9F1239', text: '#064E3B', chairFill: '#9F1239', sublabel: '#9F1239' };
    case 'occupied':
      return { fill: '#FFF1F2', stroke: '#E11D48', text: '#881337', chairFill: '#E11D48', sublabel: '#FB7185' };
    case 'reserved':
      return { fill: '#F5F3FF', stroke: '#7C3AED', text: '#3730A3', chairFill: '#7C3AED', sublabel: '#A78BFA' };
    case 'being cleaned':
      return { fill: '#FFFBEB', stroke: '#D97706', text: '#78350F', chairFill: '#D97706', sublabel: '#FCD34D' };
    default:
      return { fill: '#FAFAF9', stroke: '#A8A29E', text: '#57534E', chairFill: '#A8A29E', sublabel: '#D6D3D1' };
  }
};

export const getTableSize = (table: Table) => {
  const cap = table.capacity || 2;
  const shape = table.shape?.toLowerCase() || 'round';
  if (shape === 'round' || shape === 'circle') {
    const s = cap <= 2 ? 84 : cap <= 4 ? 100 : 116;
    return { w: s, h: s };
  }
  if (shape === 'booth') {
    return { w: cap <= 4 ? 120 : 144, h: cap <= 4 ? 72 : 84 };
  }
  if (shape === 'rectangle' || shape === 'long' || shape === 'oval') {
    return { w: cap <= 4 ? 128 : 160, h: 74 };
  }
  const s = cap <= 2 ? 84 : cap <= 4 ? 100 : 116;
  return { w: s, h: s };
};

export const hasPositionData = (tables: Table[]) =>
  tables.length > 0 &&
  tables.every(t =>
    (t.position_x !== undefined && t.position_x !== null) &&
    (t.position_y !== undefined && t.position_y !== null) &&
    (t.position_x !== 0 || t.position_y !== 0),
  );

export const autoLayoutTables = (tables: Table[], canvasWidth: number) => {
  const GAP = 32;
  const PAD = 20;
  const W = canvasWidth;
  const sorted = [...tables].sort(
    (a, b) => (Number(a.table_number) || 0) - (Number(b.table_number) || 0),
  );
  const out: { table: Table; x: number; y: number; w: number; h: number }[] = [];
  let curX = PAD, curY = PAD, rowH = 0;

  sorted.forEach(table => {
    const size = getTableSize(table);
    if (curX + size.w + PAD > W && curX > PAD) {
      curX = PAD; curY += rowH + GAP; rowH = 0;
    }
    out.push({ table, x: curX, y: curY, w: size.w, h: size.h });
    curX += size.w + GAP;
    rowH = Math.max(rowH, size.h);
  });

  const totalHeight = curY + rowH + PAD + 20;
  return { positions: out, totalWidth: W, totalHeight: Math.max(totalHeight, 180) };
};

export const renderChairs = (
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, color: string,
): React.ReactElement[] => {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle';
  const r = 6;
  const gap = 9;

  if (isRound) {
    const orbit = w / 2 + gap + r;
    for (let i = 0; i < capacity; i++) {
      const a = (2 * Math.PI * i) / capacity - Math.PI / 2;
      chairs.push(
        React.createElement('circle', {
          key: `c${i}`,
          cx: cx + orbit * Math.cos(a),
          cy: cy + orbit * Math.sin(a),
          r, fill: color, opacity: 0.55,
        }),
      );
    }
  } else {
    const halfH = h / 2 + gap + r;
    const top = Math.ceil(capacity / 2);
    const bot = capacity - top;
    for (let i = 0; i < top; i++) {
      const xp = cx - w / 2 + (w / (top + 1)) * (i + 1);
      chairs.push(
        React.createElement('circle', { key: `ct${i}`, cx: xp, cy: cy - halfH, r, fill: color, opacity: 0.55 }),
      );
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      chairs.push(
        React.createElement('circle', { key: `cb${i}`, cx: xp, cy: cy + halfH, r, fill: color, opacity: 0.55 }),
      );
    }
  }
  return chairs;
};
