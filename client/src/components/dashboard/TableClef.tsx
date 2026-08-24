/**
 * TableClef — a mesa ilustrada em miniatura que abre cada raia da Partitura.
 *
 * É a "clave" da pauta: antes do nome e do número, o host vê a FORMA da mesa
 * (redonda, retangular, booth), quantas cadeiras tem e o status pela cor —
 * a mesma linguagem da planta do salão, reduzida a 46px.
 */
import type { Table } from '../../types/host.types';
import { getStatusStyle, renderChairs, renderPlates } from '../host/floorPlanHelpers';

interface TableClefProps {
  table: Table;
  /** Convidados sentados agora — desenha os pratos. */
  seatedGuests?: number;
  night?: boolean;
  size?: number;
}

export default function TableClef({ table, seatedGuests = 0, night = false, size = 46 }: TableClefProps) {
  const st = getStatusStyle(table.status, night);
  const shape = table.shape?.toLowerCase() || 'round';
  const isRound = shape === 'round' || shape === 'circle' || shape === 'bar-stool';
  const capacity = table.capacity || 2;

  // viewBox fixo de 104: as mesmas coordenadas da planta, só que escaladas.
  const cx = 52;
  const cy = 52;
  const w = isRound ? 60 : 76;
  const h = isRound ? 60 : 46;

  return (
    <svg width={size} height={size} viewBox="0 0 104 104" aria-hidden="true" className="flex-shrink-0">
      {renderChairs(cx, cy, w, h, capacity, shape, st.chairFill)}
      {isRound ? (
        <circle cx={cx} cy={cy} r={w / 2} fill={st.fill} stroke={st.stroke} strokeWidth={2.4} strokeDasharray={st.dash} />
      ) : (
        <rect
          x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={12}
          fill={st.fill} stroke={st.stroke} strokeWidth={2.4} strokeDasharray={st.dash}
        />
      )}
      {seatedGuests > 0 && renderPlates(cx, cy, w, h, Math.min(seatedGuests, capacity), shape, st.plateFill)}
      <text
        x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill={st.text} fontSize={26} fontWeight={400}
        fontFamily="'Instrument Serif',Georgia,serif"
      >
        {table.table_number}
      </text>
    </svg>
  );
}
