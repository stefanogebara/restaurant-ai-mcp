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
  /** SVG stroke-dasharray — reserved tables draw dashed, everything else solid. */
  dash?: string;
  /** Plate color for seated guests (occupied tables only). */
  plateFill: string;
}

export const formatTime = (min: number): string => {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * Localized status label. Pass i18n's `t` function to translate per locale.
 * If `t` is omitted (legacy call sites), returns the canonical English label
 * for backward compatibility — but every render path on the dashboard should
 * pass `t` so Brazilian users see "Disponível" not "Available".
 */
export const statusLabel = (s: string, t?: (key: string, fallback?: string) => string) => {
  const key = (() => {
    switch (s?.toLowerCase()) {
      case 'available':     return 'settings.tableStatus.available';
      case 'occupied':      return 'settings.tableStatus.occupied';
      case 'reserved':      return 'settings.tableStatus.reserved';
      case 'being cleaned': return 'settings.tableStatus.cleaning';
      default:              return null;
    }
  })();
  const fallback = (() => {
    switch (s?.toLowerCase()) {
      case 'available':     return 'Available';
      case 'occupied':      return 'Occupied';
      case 'reserved':      return 'Reserved';
      case 'being cleaned': return 'Cleaning';
      default:              return s || 'Unknown';
    }
  })();
  if (key && t) return t(key, fallback);
  return fallback;
};

/**
 * Mesa ilustrada (Warm Glass): a ocupada é burgundy sólido com pratos
 * brancos, a reservada é tracejada em âmbar, a livre é vidro claro com
 * fio de tinta. `night` troca para a paleta do Modo Serviço — fundo
 * escuro, ocupadas brilham, o resto vira vidro escuro.
 */
export const getStatusStyle = (status: string, night = false): StatusStyle => {
  if (night) {
    switch (status?.toLowerCase()) {
      case 'available':
        return { fill: 'rgba(250,250,249,0.05)', stroke: 'rgba(250,250,249,0.18)', text: 'rgba(250,250,249,0.70)', chairFill: 'rgba(250,250,249,0.10)', sublabel: 'rgba(250,250,249,0.45)', plateFill: 'rgba(255,255,255,0.85)' };
      case 'occupied':
        return { fill: '#9F1239', stroke: '#9F1239', text: '#FFFFFF', chairFill: 'rgba(250,250,249,0.28)', sublabel: 'rgba(250,250,249,0.55)', plateFill: 'rgba(255,255,255,0.85)' };
      case 'reserved':
        return { fill: 'rgba(250,250,249,0.04)', stroke: '#FBBF24', text: '#FBBF24', chairFill: 'rgba(250,250,249,0.14)', sublabel: '#FBBF24', dash: '5 4', plateFill: 'rgba(255,255,255,0.85)' };
      case 'being cleaned':
        return { fill: 'rgba(251,191,36,0.08)', stroke: '#FBBF24', text: '#FBBF24', chairFill: 'rgba(251,191,36,0.35)', sublabel: '#FBBF24', plateFill: 'rgba(255,255,255,0.85)' };
      default:
        return { fill: 'rgba(250,250,249,0.05)', stroke: 'rgba(250,250,249,0.18)', text: 'rgba(250,250,249,0.55)', chairFill: 'rgba(250,250,249,0.10)', sublabel: 'rgba(250,250,249,0.45)', plateFill: 'rgba(255,255,255,0.85)' };
    }
  }
  switch (status?.toLowerCase()) {
    case 'available':
      return { fill: 'rgba(255,255,255,0.85)', stroke: 'rgba(28,25,23,0.15)', text: '#706A65', chairFill: 'rgba(28,25,23,0.12)', sublabel: '#706A65', plateFill: 'rgba(255,255,255,0.85)' };
    case 'occupied':
      return { fill: '#9F1239', stroke: '#9F1239', text: '#FFFFFF', chairFill: 'rgba(28,25,23,0.30)', sublabel: '#706A65', plateFill: 'rgba(255,255,255,0.85)' };
    case 'reserved':
      return { fill: '#FFFFFF', stroke: '#D97706', text: '#B45309', chairFill: 'rgba(28,25,23,0.16)', sublabel: '#B45309', dash: '5 4', plateFill: 'rgba(255,255,255,0.85)' };
    case 'being cleaned':
      return { fill: '#FFFBEB', stroke: '#D97706', text: '#78350F', chairFill: 'rgba(217,119,6,0.35)', sublabel: '#B45309', plateFill: 'rgba(255,255,255,0.85)' };
    default:
      return { fill: '#FAFAF9', stroke: 'rgba(28,25,23,0.15)', text: '#706A65', chairFill: 'rgba(28,25,23,0.12)', sublabel: '#706A65', plateFill: 'rgba(255,255,255,0.85)' };
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

/**
 * True if a location has any deliberately-positioned table. Uses `.some()`,
 * not `.every()`: a freshly-added table sits at (0,0) until dragged, and with
 * `.every()` that one origin table would flip the whole location back to
 * auto-layout — scrambling every hand-placed table on the dashboard. This
 * matches the editor's own `needsAutoLayout = !some(...)` logic.
 */
export const hasPositionData = (tables: Table[]) =>
  tables.length > 0 &&
  tables.some(t =>
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

/**
 * Pratos brancos DENTRO da mesa ocupada — um por convidado sentado
 * (limitado à capacidade). É o que faz a mesa "ler" como gente jantando,
 * não como um retângulo colorido. Espelha a órbita das cadeiras, mas
 * para dentro da borda.
 */
export const renderPlates = (
  cx: number, cy: number, w: number, h: number,
  guests: number, shape: string, fill: string,
): React.ReactElement[] => {
  const plates: React.ReactElement[] = [];
  const count = Math.max(0, Math.min(guests, 8));
  if (count === 0) return plates;
  const isRound = shape === 'round' || shape === 'circle';
  const r = Math.min(7, Math.max(5, Math.floor(Math.min(w, h) / 14)));

  if (isRound) {
    if (count === 1) {
      plates.push(React.createElement('circle', { key: 'p0', cx, cy: cy - h / 4, r, fill }));
      return plates;
    }
    const orbit = w / 2 - r - 6;
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / count - Math.PI / 2;
      plates.push(
        React.createElement('circle', {
          key: `p${i}`,
          cx: cx + orbit * Math.cos(a),
          cy: cy + orbit * Math.sin(a),
          r, fill,
        }),
      );
    }
  } else {
    const top = Math.ceil(count / 2);
    const bot = count - top;
    const rowY = h / 2 - r - 7;
    for (let i = 0; i < top; i++) {
      const xp = cx - w / 2 + (w / (top + 1)) * (i + 1);
      plates.push(React.createElement('circle', { key: `pt${i}`, cx: xp, cy: cy - rowY, r, fill }));
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      plates.push(React.createElement('circle', { key: `pb${i}`, cx: xp, cy: cy + rowY, r, fill }));
    }
  }
  return plates;
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
