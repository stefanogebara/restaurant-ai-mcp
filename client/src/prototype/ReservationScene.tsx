import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CompactReservation } from "./CompactReservation";
import { Canvas } from "./ScenePrimitives";
import { reservationPalette } from "./reservationPalette";

const { ink, muted, rule, action: green, canvas, detail: detailSurface, selection: selectionRgb } = reservationPalette;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function ReservationRow({ top, time, name, party, emphasis = 0 }: {
  top: number; time: string; name: string; party: string; emphasis?: number;
}) {
  return (
    <div style={{ position: "absolute", left: 26, width: 250, top, height: 44, display: "flex", alignItems: "center", borderTop: "1px solid " + rule, background: emphasis ? `rgba(${selectionRgb},${emphasis * 0.8})` : "transparent", color: ink }}>
      {emphasis > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: green, opacity: emphasis }} />}
      <span style={{ width: 58, paddingLeft: emphasis ? 9 : 7, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ flex: 1, fontSize: 14, letterSpacing: "-.2px" }}>{name}</span>
      <span style={{ paddingRight: 8, color: muted, fontSize: 12 }}>{party}</span>
    </div>
  );
}

/** A WhatsApp booking becomes a visible reservation note for the host. */
export function ReservationScene() {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const arrival = interpolate(frame, [12, 36], [0, 1], clamp);
  const selection = interpolate(frame, [36, 58], [0, 1], clamp);
  const placeholder = interpolate(frame, [36, 43], [1, 0], clamp);
  const information = interpolate(frame, [44, 58], [0, 1], clamp);
  const detail = interpolate(frame, [58, 88], [0, 1], clamp);

  if (width < 500) return <CompactReservation arrival={arrival} selection={selection} placeholder={placeholder} information={information} detail={detail} />;

  return (
    <Canvas padding={0}>
      <div style={{ position: "absolute", inset: 0, background: canvas }} />
      <div style={{ position: "absolute", left: 26, right: 26, top: 23, display: "flex", justifyContent: "space-between", alignItems: "center", color: ink }}>
        <span style={{ fontSize: 18, letterSpacing: "-.35px" }}>Casa Tuim</span>
        <span style={{ color: muted, fontSize: 12 }}>Quinta-feira · {arrival > 0.82 ? "5" : "4"} próximas</span>
      </div>
      <div style={{ position: "absolute", left: 26, right: 26, top: 60, height: 1, background: rule }} />
      <div style={{ position: "absolute", left: 26, top: 82, color: ink, fontSize: 17, letterSpacing: "-.35px" }}>Reservas de hoje</div>
      <div style={{ position: "absolute", left: 26, top: 125, width: 250, display: "flex", color: muted, fontSize: 10, letterSpacing: ".7px" }}>
        <span style={{ width: 58, paddingLeft: 7 }}>HORA</span><span style={{ flex: 1 }}>RESERVA</span><span style={{ paddingRight: 8 }}>GRUPO</span>
      </div>
      <ReservationRow top={146} time="19:15" name="Rafael" party="2" />
      <ReservationRow top={190} time="19:45" name="Ana" party="2" />
      <div style={{ opacity: arrival, transform: "translateY(" + ((1 - arrival) * 8) + "px)" }}>
        <ReservationRow top={234} time="20:00" name="Marina" party="4" emphasis={selection} />
      </div>
      <ReservationRow top={234 + 44 * arrival} time="21:00" name="Luiza" party="3" />
      <ReservationRow top={278 + 44 * arrival} time="21:30" name="Pedro" party="2" />
      <div style={{ position: "absolute", left: 26, width: 250, top: 322 + 44 * arrival, height: 1, background: rule }} />

      <div style={{ position: "absolute", left: 299, right: 20, top: 82, bottom: 20, background: detailSurface, opacity: selection }} />
      <div style={{ position: "absolute", left: 299, top: 82, bottom: 20, width: 2, background: green, opacity: selection }} />
      <div style={{ position: "absolute", left: 331, right: 42, top: 142, color: muted, fontSize: 15, lineHeight: 1.4, opacity: placeholder }}>
        Selecione uma reserva para ver os detalhes.
      </div>
      <div style={{ position: "absolute", left: 331, right: 38, top: 102, opacity: information, transform: "translateY(" + ((1 - information) * 10) + "px)" }}>
        <div style={{ color: green, fontSize: 11, letterSpacing: ".8px" }}>RESERVA CONFIRMADA · WHATSAPP</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 15, marginTop: 14, color: ink }}><span style={{ fontSize: 41, lineHeight: 1, letterSpacing: "-1.7px" }}>Marina</span><span style={{ fontSize: 21, color: muted }}>20:00</span></div>
        <div style={{ color: muted, fontSize: 14, marginTop: 7 }}>4 pessoas</div>
        <div style={{ width: "100%", height: 1, background: rule, marginTop: 17 }} />
      </div>
      <div style={{ position: "absolute", left: 331, right: 40, top: 225, opacity: detail, transform: "translateY(" + ((1 - detail) * 8) + "px)" }}>
        <div style={{ color: green, fontSize: 11, letterSpacing: ".8px" }}>PEDIDO ESPECIAL</div>
        <div style={{ marginTop: 10, color: ink, fontSize: 24, lineHeight: 1.13, letterSpacing: "-.65px" }}>Cadeira infantil; mesa perto da janela, se possível.</div>
        <div style={{ marginTop: 12, color: muted, fontSize: 12, lineHeight: 1.3 }}>Anotado. A equipe confirma a disponibilidade.</div>
      </div>
    </Canvas>
  );
}
