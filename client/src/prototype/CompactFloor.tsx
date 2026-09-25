import { Canvas, Check, DotNumber } from "./ScenePrimitives";
import { RestaurantPlan } from "./FloorPlan";

/** Keep the host's essential decisions readable at phone sizes. */
export function CompactFloor() {
  return (
    <Canvas padding={22}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 16,
        }}
      >
        <span>seatable / salão</span>
        <span style={{ color: "#59684b" }}>20:30</span>
      </div>
      <h4
        style={{
          fontSize: 32,
          lineHeight: 1.05,
          fontWeight: 400,
          letterSpacing: "-1px",
          margin: "27px 0 22px",
        }}
      >
        O próximo lugar.
        <br />
        Pronto para receber.
      </h4>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          borderBottom: "1px solid #cdd3c3",
          paddingBottom: 19,
        }}
      >
        <DotNumber value="24" height={46} />
        <span style={{ fontSize: 15, lineHeight: 1.4 }}>
          pessoas na casa
          <br />
          <span style={{ color: "#59684b" }}>6 mesas ocupadas · 2 livres</span>
        </span>
      </div>
      <div style={{ height: 190, marginTop: 19, position: "relative" }}>
        <div
          style={{
            width: 548,
            transform: "scale(.649635)",
            transformOrigin: "top left",
          }}
        >
          <RestaurantPlan />
        </div>
      </div>
      <div
        style={{
          background: "#fcfcf7",
          borderRadius: 12,
          padding: "18px 16px",
          display: "flex",
          gap: 13,
          alignItems: "center",
        }}
      >
        <span
          style={{
            width: 43,
            height: 43,
            display: "grid",
            placeItems: "center",
            background: "#dffa70",
            borderRadius: 10,
            fontSize: 22,
          }}
        >
          06
        </span>
        <div>
          <div style={{ fontSize: 22, letterSpacing: "-.5px" }}>
            Rafael e mais 3
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 15,
              color: "#526a38",
              marginTop: 6,
            }}
          >
            <Check size={16} />
            Recebidos na mesa
          </div>
        </div>
      </div>
    </Canvas>
  );
}
