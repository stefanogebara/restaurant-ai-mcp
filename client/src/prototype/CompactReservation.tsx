import { Canvas } from "./ScenePrimitives";
import { reservationPalette } from "./reservationPalette";

const { ink, muted, rule, action, canvas, detail: detailSurface, selection: selectionRgb } = reservationPalette;

function ReservationRow({ top, time, name, party, emphasis = 0 }: {
  top: number; time: string; name: string; party: string; emphasis?: number;
}) {
  return (
    <div style={{ position: "absolute", left: 22, right: 22, top, height: 56, borderTop: `1px solid ${rule}`, display: "flex", alignItems: "center", background: emphasis ? `rgba(${selectionRgb},${emphasis * 0.8})` : "transparent", color: ink }}>
      {emphasis > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: action, opacity: emphasis }} />}
      <span style={{ width: 71, paddingLeft: emphasis ? 12 : 7, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ flex: 1, fontSize: 18, letterSpacing: "-.35px" }}>{name}</span>
      <span style={{ paddingRight: 8, color: muted, fontSize: 13 }}>{party} pessoas</span>
    </div>
  );
}

/** The mobile film leads with the completed booking, then shows its place in service. */
export function CompactReservation({ arrival, selection, placeholder, detail }: {
  arrival: number; selection: number; placeholder: number; information: number; detail: number;
}) {
  const bookingReveal = Math.max(0, Math.min(1, (selection - 0.58) / 0.42));
  return (
    <Canvas padding={0}>
      <div style={{ position: "absolute", inset: 0, background: canvas }} />
      <div style={{ position: "absolute", left: 22, right: 22, top: 17, display: "flex", justifyContent: "space-between", alignItems: "baseline", color: ink }}>
        <span style={{ fontSize: 19, letterSpacing: "-.4px" }}>Casa Tuim</span>
        <span style={{ color: muted, fontSize: 14 }}>Quinta-feira · {arrival > 0.82 ? "3" : "2"} próximas</span>
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 51, height: 1, background: rule }} />

      <div style={{ position: "absolute", left: 0, right: 0, top: 65, height: 205, background: detailSurface, opacity: bookingReveal }} />
      <div style={{ position: "absolute", left: 22, right: 22, top: 336, color: muted, fontSize: 15, opacity: placeholder }}>
        Selecione uma reserva para ver os detalhes.
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 80, opacity: bookingReveal, transform: `translateY(${(1 - bookingReveal) * 7}px)` }}>
        <div style={{ color: action, fontSize: 13, letterSpacing: ".5px" }}>RESERVA CONFIRMADA · WHATSAPP</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, color: ink }}>
          <span style={{ fontSize: 37, lineHeight: 1, letterSpacing: "-1.4px" }}>Marina</span>
          <span style={{ fontSize: 23, fontVariantNumeric: "tabular-nums" }}>20:00</span>
        </div>
        <div style={{ marginTop: 8, color: muted, fontSize: 14 }}>4 pessoas · Mesa 02</div>
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 170, opacity: detail, transform: `translateY(${(1 - detail) * 7}px)` }}>
        <div style={{ height: 1, background: rule, marginBottom: 10 }} />
        <div style={{ color: action, fontSize: 13, letterSpacing: ".5px" }}>PEDIDO ESPECIAL</div>
        <div style={{ marginTop: 6, color: ink, fontSize: 17, lineHeight: 1.18, letterSpacing: "-.3px" }}>Cadeira infantil; mesa perto da janela, se possível.</div>
        <div style={{ marginTop: 7, color: muted, fontSize: 12 }}>A equipe confirma a disponibilidade.</div>
      </div>

      <div style={{ position: "absolute", inset: 0, transform: `translateY(${-210 * (1 - selection)}px)` }}>
        <div style={{ position: "absolute", left: 22, right: 22, top: 289, display: "flex", justifyContent: "space-between", alignItems: "baseline", color: ink }}>
          <span style={{ fontSize: 20, letterSpacing: "-.4px" }}>Reservas de hoje</span>
          <span style={{ color: muted, fontSize: 12 }}>HORA · NOME · GRUPO</span>
        </div>
        <ReservationRow top={332} time="19:15" name="Rafael" party="2" />
        <div style={{ opacity: arrival, transform: `translateY(${(1 - arrival) * 7}px)` }}>
          <ReservationRow top={388} time="20:00" name="Marina" party="4" emphasis={selection} />
        </div>
        <ReservationRow top={388 + 56 * arrival} time="21:00" name="Luiza" party="3" />
        <div style={{ position: "absolute", left: 22, right: 22, top: 444 + 56 * arrival, height: 1, background: rule }} />
      </div>
    </Canvas>
  );
}
