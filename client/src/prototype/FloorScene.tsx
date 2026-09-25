import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DotNumber } from "./ScenePrimitives";

import { RestaurantPlan } from "./FloorPlan";
import { CompactFloor } from "./CompactFloor";
const ink = "#353731";
const muted = "#62685a";
const line = "#d8dad1";
const lime = "#dffa70";

export function FloorScene() {
  const frame = useCurrentFrame() % 240;
  const { width } = useVideoConfig();
  const emphasis = interpolate(
    frame,
    [0, 36, 90, 190, 239],
    [0.75, 0.75, 1, 1, 0.75],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  if (width < 500) return <CompactFloor />;
  return (
    <AbsoluteFill
      style={{
        padding: "24px 26px",
        boxSizing: "border-box",
        overflow: "hidden",
        background: "#eaece5",
        color: ink,
        fontFamily: '"Instrument Sans", "Inter", sans-serif',
        fontWeight: 400,
      }}
    >
      <div
        style={{
          height: 39,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          fontSize: 15,
        }}
      >
        <span style={{ letterSpacing: "-.5px", fontWeight: 500 }}>
          seatable<span style={{ color: "#969d87" }}> / </span>salão
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#637055",
            fontSize: 12,
            paddingTop: 2,
          }}
        >
          <i
            style={{
              width: 5,
              height: 5,
              borderRadius: 5,
              background: "#849567",
            }}
          />{" "}
          Serviço da noite
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 13,
        }}
      >
        <div style={{ fontSize: 29, letterSpacing: "-1.15px", lineHeight: 1 }}>
          Cada mesa, no seu tempo.
        </div>
      </div>
      <div
        style={{ display: "flex", height: 88, alignItems: "center", gap: 23 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DotNumber value="24" height={40} />
          <span style={{ fontSize: 12, color: muted, lineHeight: 1.3 }}>
            pessoas
            <br />
            na casa
          </span>
        </div>
        <div style={{ width: 1, height: 31, background: line }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 9 }}>
            {Array.from({ length: 8 }, (_, n) => (
              <span
                key={n}
                style={{
                  height: 5,
                  flex: 1,
                  borderRadius: 4,
                  background: n < 6 ? "#9ba78b" : "#d4d9cc",
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: muted,
            }}
          >
            <span>
              <span style={{ color: ink }}>6</span> ocupadas
            </span>
            <span>
              <span style={{ color: ink }}>2</span> livres
            </span>
          </div>
        </div>
        <div style={{ width: 1, height: 31, background: line }} />
        <div style={{ fontSize: 12, color: muted, lineHeight: 1.4 }}>
          <span style={{ color: ink, fontSize: 20 }}>20:30</span>
          <br />
          sábado, 12 set
        </div>
      </div>
      <RestaurantPlan />
      <div
        style={{
          marginTop: 13,
          height: 59,
          padding: "0 16px",
          borderRadius: 16,
          background: "#f9faf5",
          display: "flex",
          alignItems: "center",
          gap: 13,
          border: "1px solid #fefefb",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 33,
            height: 33,
            borderRadius: 11,
            background: lime,
            opacity: emphasis,
            fontSize: 15,
          }}
        >
          06
        </span>
        <div style={{ flex: 1, lineHeight: 1.3 }}>
          <div style={{ fontSize: 15, letterSpacing: "-.2px" }}>
            Rafael e mais 3
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
            Reserva recebida pelo WhatsApp
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "#617345",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m3 7 3 3 5-6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          Na mesa
        </div>
      </div>
    </AbsoluteFill>
  );
}
