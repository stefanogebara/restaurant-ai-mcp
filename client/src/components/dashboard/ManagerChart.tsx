/**
 * Gráfico inline das respostas do Manager AI — Warm Glass + série única.
 *
 * Decisões (skill de dataviz, validadas):
 * - Série ÚNICA em burgundy (#9F1239) — job sequencial/magnitude; sem legenda
 *   (o título nomeia a série), sem paleta categórica no v1.
 * - Marcas finas: barras com topo arredondado 4px ancoradas na baseline,
 *   linha 2px sem pontos (só o ENDPOINT enfatizado), área com gradiente sutil.
 * - Grid recessivo (6% de tinta, só horizontal); eixos sem linha; texto em
 *   tokens de texto (muted-stone), nunca na cor da série; tabular-nums.
 * - Tooltip glass por marca (hover é padrão, não opcional).
 */

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import type { ChartSpec } from '../../utils/managerRichBlocks';

const BURGUNDY = '#9F1239';
const INK_GRID = 'rgba(28, 25, 23, 0.06)';
const INK_MUTED = '#706A65';

const AXIS_TICK = { fontSize: 11, fill: INK_MUTED } as const;

function GlassTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white/85 backdrop-blur-glass-chip border border-glass-border shadow-glass-card rounded-xl px-3 py-2">
      <p className="text-[11px] text-muted-stone leading-tight">{label}</p>
      <p className="text-sm font-semibold text-deep-charcoal leading-tight tabular-nums">
        {payload[0].value.toLocaleString()}
        {unit ? <span className="font-normal text-muted-stone text-xs"> {unit}</span> : null}
      </p>
    </div>
  );
}

export default function ManagerChart({ spec }: { spec: ChartSpec }) {
  const { type, title, unit, data } = spec;
  const lastIdx = data.length - 1;

  const shared = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: -18 },
  };
  const axes = (
    <>
      <CartesianGrid stroke={INK_GRID} vertical={false} />
      <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
      <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={54} />
      <Tooltip
        content={<GlassTooltip unit={unit} />}
        cursor={type === 'bar' ? { fill: 'rgba(159, 18, 57, 0.05)' } : { stroke: 'rgba(159, 18, 57, 0.25)', strokeWidth: 1 }}
      />
    </>
  );

  return (
    <figure className="my-2.5 rounded-2xl bg-white/50 border border-glass-border p-3 sm:p-4" role="img" aria-label={title || 'Gráfico'}>
      {title && (
        <figcaption className="text-xs font-medium text-deep-charcoal mb-2 flex items-baseline gap-1.5">
          {title}
          {unit && <span className="text-[10px] font-normal text-muted-stone">({unit})</span>}
        </figcaption>
      )}
      <div className="w-full" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart {...shared}>
              {axes}
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive>
                {data.map((_, i) => (
                  <Cell key={i} fill={BURGUNDY} fillOpacity={i === lastIdx ? 1 : 0.82} />
                ))}
              </Bar>
            </BarChart>
          ) : type === 'line' ? (
            <LineChart {...shared}>
              {axes}
              <Line
                type="monotone" dataKey="value" stroke={BURGUNDY} strokeWidth={2}
                dot={(p: { index?: number; cx?: number; cy?: number }) =>
                  p.index === lastIdx
                    ? <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={BURGUNDY} stroke="#FFFFFF" strokeWidth={2} />
                    : <g key={p.index} />}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
                isAnimationActive
              />
            </LineChart>
          ) : (
            <AreaChart {...shared}>
              <defs>
                <linearGradient id="managerAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BURGUNDY} stopOpacity={0.20} />
                  <stop offset="100%" stopColor={BURGUNDY} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {axes}
              <Area
                type="monotone" dataKey="value" stroke={BURGUNDY} strokeWidth={2}
                fill="url(#managerAreaFill)" isAnimationActive
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
