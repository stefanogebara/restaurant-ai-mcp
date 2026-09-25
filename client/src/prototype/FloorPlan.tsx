// Reference lock: pale instrument canvas, physical white objects, one lime arrival.
// The architecture is a restaurant plan, not a generic diagram or dashboard grid.
const ink = "#353731";
const muted = "#77796f";
const lime = "#dffa70";
const tables = [
  { x: 83, y: 66, number: "01", round: true, occupied: true },
  { x: 200, y: 66, number: "02", occupied: true },
  { x: 317, y: 66, number: "03", occupied: true },
  { x: 434, y: 66, number: "04", round: true, occupied: false },
  { x: 83, y: 173, number: "05", occupied: true },
  { x: 200, y: 173, number: "06", occupied: true },
  { x: 317, y: 173, number: "07", round: true, occupied: false },
  { x: 434, y: 173, number: "08", occupied: true },
];

function Table({ x, y, number, round, occupied }: (typeof tables)[number]) {
  const selected = number === "06";
  const chair = occupied ? "#d8dcd0" : "#eeefe9";
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 180].map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <rect
            x="-14"
            y="-40"
            width="28"
            height="11"
            rx="4.5"
            fill={chair}
            stroke="#c9cec1"
            strokeWidth=".8"
          />
          <path d="M-11-37H11" stroke="#bfc6b7" strokeWidth=".65" />
        </g>
      ))}
      {[90, 270].map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <rect
            x="-12"
            y="-40"
            width="24"
            height="10"
            rx="4"
            fill={chair}
            stroke="#c9cec1"
            strokeWidth=".8"
          />
        </g>
      ))}
      <rect
        x="-27"
        y="-26"
        width="54"
        height="54"
        rx={round ? 27 : 9}
        fill="#c8cbbf"
        opacity=".22"
      />
      <rect
        x="-27"
        y="-28"
        width="54"
        height="54"
        rx={round ? 27 : 9}
        fill={selected ? lime : "#fffefa"}
        stroke={selected ? "#b4c65e" : "#cdd1c4"}
        strokeWidth=".9"
      />
      <text
        y="4"
        textAnchor="middle"
        fontSize="16"
        fill={occupied ? ink : "#999c92"}
      >
        {number}
      </text>
      {occupied && !selected && (
        <circle cx="0" cy="16" r="1.7" fill="#899678" />
      )}
      {selected && (
        <path
          d="m-4 16 3 3 6-6"
          fill="none"
          stroke="#667937"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

export function RestaurantPlan() {
  return (
    <svg
      viewBox="0 0 548 270"
      width="548"
      height="270"
      role="img"
      aria-label="Planta de oito mesas. Seis ocupadas, duas livres. Rafael chegou à mesa seis."
    >
      <rect x="0" y="0" width="548" height="270" rx="21" fill="#f6f7f1" />
      {/* Architecture: continuous wall with inset windows and a real entrance opening. */}
      <path
        d="M246 246H25V19H523V246H311"
        fill="none"
        stroke="#b8bfb0"
        strokeWidth="3"
      />
      {[56, 173, 290, 407].map((x) => (
        <g key={x}>
          <path d={`M${x} 19h55`} stroke="#f6f7f1" strokeWidth="7" />
          <path d={`M${x} 16h55m-55 6h55`} stroke="#bcc3b2" strokeWidth=".85" />
          <path d={`M${x + 27.5} 16v6`} stroke="#bcc3b2" strokeWidth=".85" />
        </g>
      ))}
      <path
        d="M246 246v-48a48 48 0 0 1 48 48"
        fill="none"
        stroke="#c9cebf"
        strokeWidth=".9"
      />
      <path d="M246 246v-48" stroke="#a8b39b" strokeWidth="1.6" />
      {/* Upholstered perimeter banquette, drawn with seams rather than iconography. */}
      <rect
        x="489"
        y="36"
        width="20"
        height="170"
        rx="7"
        fill="#e1e5d7"
        stroke="#cbd2c0"
        strokeWidth=".8"
      />
      <path
        d="M503 42v158M490 91h18M490 147h18"
        stroke="#c5cdbb"
        strokeWidth=".8"
      />
      <path d="M49 118H462" stroke="#e7e9e0" strokeDasharray="2 5" />
      <text x="39" y="236" fontSize="10" letterSpacing="1.6" fill="#8c9184">
        SALÃO PRINCIPAL
      </text>
      <rect
        x="390"
        y="226"
        width="69"
        height="15"
        rx="4"
        fill="#e6e9df"
        stroke="#cdd3c4"
        strokeWidth=".8"
      />
      <rect
        x="415"
        y="228"
        width="18"
        height="9"
        rx="2"
        fill="#fafbf6"
        stroke="#bcc7ad"
        strokeWidth=".7"
      />
      <text
        x="424"
        y="259"
        textAnchor="middle"
        fontSize="10"
        letterSpacing=".8"
        fill={muted}
      >
        RECEPÇÃO
      </text>
      <text
        x="279"
        y="261"
        textAnchor="middle"
        fontSize="10"
        letterSpacing=".9"
        fill={muted}
      >
        ENTRADA
      </text>
      {tables.map((table) => (
        <Table key={table.number} {...table} />
      ))}
      {/* A compact location marker makes the selection legible without a decorative orbit. */}
      <path d="M200 125v7" stroke="#8d9d52" strokeWidth="1" />
      <circle
        cx="200"
        cy="121"
        r="4"
        fill={lime}
        stroke="#a7b960"
        strokeWidth=".8"
      />
    </svg>
  );
}
