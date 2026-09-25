import { Img, interpolate, useCurrentFrame } from "remotion";
import { Canvas, Check, DotNumber } from "./ScenePrimitives";

/** Arrival rather than an abstract timer: waiting, notified, then welcomed. */
export function QueueScene() {
  const frame = useCurrentFrame();
  const ready = frame >= 72 && frame < 198;
  const progress = interpolate(frame, [24, 72, 180, 216], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Canvas padding={22}>
      <div style={{ fontSize: 16, letterSpacing: "-.4px" }}>bar do zé</div>
      <div
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          gap: 11,
        }}
      >
        <Img
          src="/images/artifact/asset-10.jpg"
          style={{
            width: 47,
            height: 47,
            objectFit: "cover",
            borderRadius: 15,
          }}
        />
        <div>
          <div style={{ fontSize: 21, letterSpacing: "-.6px" }}>
            Pode ir chegando.
          </div>
          <div style={{ fontSize: 13, color: "#6d7563", marginTop: 4 }}>
            A sua noite já começou.
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 20,
          borderRadius: 26,
          height: 233,
          position: "relative",
          overflow: "hidden",
          background: "#46644c",
          color: "#f6f9e9",
          padding: "22px 23px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 15, color: "#e2ead6" }}>
          {ready ? "Joana, a mesa está pronta." : "Tempo estimado de espera"}
        </div>
        <div
          style={{ display: "flex", alignItems: "end", gap: 10, marginTop: 19 }}
        >
          <DotNumber value={ready ? "02" : "08"} height={68} color="#f6f9e9" />
          <span style={{ fontSize: 19, marginBottom: 12 }}>
            {ready ? "" : "minutos"}
          </span>
        </div>
        <svg
          viewBox="0 0 250 72"
          style={{
            width: 250,
            height: 72,
            position: "absolute",
            left: 23,
            bottom: 14,
          }}
          aria-hidden="true"
        >
          <path
            d="M12 39H237"
            stroke="#a8bda0"
            strokeOpacity=".5"
            strokeWidth="1"
          />
          <path
            d="M12 39H237"
            stroke="#dff396"
            strokeWidth="2"
            strokeDasharray="225"
            strokeDashoffset={225 * (1 - progress)}
          />
          {[12, 124, 237].map((x, i) => (
            <g key={x}>
              <circle
                cx={x}
                cy="39"
                r={i === 2 ? 9 : 6}
                fill={
                  i === 0 || (i === 1 && progress >= 0.5) || ready
                    ? "#dbeaac"
                    : "#46644c"
                }
                stroke="#bdceaa"
              />
              {i === 2 && (
                <circle
                  cx={x}
                  cy="39"
                  r={15 + progress * 5}
                  fill="none"
                  stroke="#daeea8"
                  opacity={0.12 + progress * 0.2}
                />
              )}
            </g>
          ))}
          <text x="1" y="14" fill="#ecf2df" fontSize="12">
            Na fila
          </text>
          <text x="93" y="14" fill="#ecf2df" fontSize="12">
            Mesa livre
          </text>
          <text x="206" y="14" fill="#ecf2df" fontSize="12">
            Aviso
          </text>
          <text x="1" y="68" fill="#cbd9bf" fontSize="11">
            19:42
          </text>
          <text x="102" y="68" fill="#cbd9bf" fontSize="11">
            19:50
          </text>
          <text x="209" y="68" fill="#cbd9bf" fontSize="11">
            agora
          </text>
        </svg>
      </div>
      <div
        style={{
          marginTop: 17,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 2px 15px",
          borderBottom: "1px solid #cdd5c4",
        }}
      >
        <div>
          <div style={{ fontSize: 19 }}>Joana + 1</div>
          <div style={{ fontSize: 13, marginTop: 4, color: "#6f7964" }}>
            Balcão ou mesa? Mesa.
          </div>
        </div>
        <span
          style={{
            background: "#f7f9ef",
            borderRadius: 20,
            padding: "8px 10px",
            color: "#58694a",
            fontSize: 12,
          }}
        >
          2 pessoas
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#ddeaaf",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Check color="#536d3e" size={15} />
        </span>
        <div>
          <div style={{ fontSize: 14 }}>
            {ready ? "Aviso enviado no WhatsApp" : "Seu lugar está guardado"}
          </div>
          <div style={{ fontSize: 12, color: "#717b65", marginTop: 3 }}>
            {ready
              ? "A gente espera você por 5 min."
              : "Pode passear. A gente avisa."}
          </div>
        </div>
      </div>
    </Canvas>
  );
}
