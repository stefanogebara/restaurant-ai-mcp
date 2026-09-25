import { type CSSProperties } from "react";
const ink = "#343730";
const muted = "#62675c";
const green = "#405b37";
const label: CSSProperties = {
  fontSize: 10,
  letterSpacing: "1.2px",
  color: muted,
};
export function BookingSelection({
  arrival,
  selected,
}: {
  arrival: number;
  selected: boolean;
}) {
  return (
    <div
      style={{
        opacity: Math.max(0, 1 - arrival * 2),
        transform: `translateY(${-arrival * 9}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 11,
        }}
      >
        <span style={{ fontSize: 18, letterSpacing: "-.3px" }}>Setembro</span>
        <span style={{ ...label, letterSpacing: ".4px" }}>2026</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {["Qua", "Qui", "Sex", "Sáb", "Dom", "Seg", "Ter"].map((day, i) => (
          <div key={day} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: muted, marginBottom: 5 }}>
              {day}
            </div>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                height: 30,
                borderRadius: 20,
                fontSize: 14,
                background: i === 3 ? "#e3efc3" : "#f5f5f0",
                color: i === 3 ? green : ink,
              }}
            >
              {9 + i}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          padding: "12px 0 10px",
          borderBottom: "1px solid #e6e6de",
        }}
      >
        <span>Uma mesa para</span>
        <span>4 pessoas</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {["19:30", "20:00", "20:30"].map((time, i) => (
          <div
            key={time}
            style={{
              flex: 1,
              padding: "9px 0",
              textAlign: "center",
              borderRadius: 8,
              fontSize: 14,
              color: selected && i === 2 ? green : ink,
              background: selected && i === 2 ? "#e3efc3" : "#f5f5f0",
              boxShadow:
                selected && i === 2 ? "inset 0 0 0 1px #bfd294" : "none",
            }}
          >
            {time}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "10px 13px",
          borderRadius: 20,
          background: ink,
          color: "#fff",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        Reservar a nossa mesa
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
