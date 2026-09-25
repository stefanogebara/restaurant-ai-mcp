import { Canvas } from "./ScenePrimitives";

const ink = "#27312a";
const muted = "#697168";
const rule = "#d9ddd4";
const green = "#365944";

function ReservationRow({ top, time, name, party, emphasis = 0 }: {
  top: number; time: string; name: string; party: string; emphasis?: number;
}) {
  return (
    <div style={{ position: "absolute", left: 22, right: 22, top, height: 59, borderTop: "1px solid " + rule, display: "flex", alignItems: "center", background: emphasis ? "rgba(232,239,226," + (emphasis * 0.8) + ")" : "transparent", color: ink }}>
      {emphasis > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: green, opacity: emphasis }} />}
      <span style={{ width: 71, paddingLeft: emphasis ? 12 : 7, fontSize: 19, letterSpacing: "-.6px" }}>{time}</span>
      <span style={{ flex: 1, fontSize: 19, letterSpacing: "-.35px" }}>{name}</span>
      <span style={{ paddingRight: 8, color: muted, fontSize: 13 }}>{party} pessoas</span>
    </div>
  );
}

/** Purpose-built mobile host view; the guest request is a note, not a task. */
export function CompactReservation({ arrival, selection, placeholder, information, detail }: {
  arrival: number; selection: number; placeholder: number; information: number; detail: number;
}) {
  return (
    <Canvas padding={0}>
      <div style={{ position: "absolute", inset: 0, background: "#fbfbf8" }} />
      <div style={{ position: "absolute", left: 22, right: 22, top: 18, display: "flex", justifyContent: "space-between", alignItems: "center", color: ink }}>
        <span style={{ fontSize: 20, letterSpacing: "-.4px" }}>Casa Tuim</span>
        <span style={{ color: muted, fontSize: 13 }}>Quinta-feira · {arrival > 0.82 ? "3" : "2"} próximas</span>
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 53, height: 1, background: rule }} />
      <div style={{ position: "absolute", left: 22, top: 73, color: ink, fontSize: 24, letterSpacing: "-.55px" }}>Reservas de hoje</div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 115, display: "flex", color: muted, fontSize: 12, letterSpacing: ".5px" }}>
        <span style={{ width: 71, paddingLeft: 7 }}>HORA</span><span style={{ flex: 1 }}>RESERVA</span><span style={{ paddingRight: 8 }}>GRUPO</span>
      </div>
      <ReservationRow top={134} time="19:15" name="Rafael" party="2" />
      <div style={{ opacity: arrival, transform: "translateY(" + ((1 - arrival) * 7) + "px)" }}>
        <ReservationRow top={193} time="20:00" name="Marina" party="4" emphasis={selection} />
      </div>
      <ReservationRow top={193 + 59 * arrival} time="21:00" name="Luiza" party="3" />
      <div style={{ position: "absolute", left: 22, right: 22, top: 252 + 59 * arrival, height: 1, background: rule }} />
      <div style={{ position: "absolute", left: 22, right: 22, top: 353, color: muted, fontSize: 14, opacity: placeholder }}>
        Selecione uma reserva para ver os detalhes.
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, top: 335, bottom: 0, background: "#f1f4ed", opacity: selection }} />
      <div style={{ position: "absolute", left: 22, right: 22, top: 352, opacity: information, transform: "translateY(" + ((1 - information) * 7) + "px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: ink }}>
          <span style={{ fontSize: 20 }}>Marina · 20:00</span><span style={{ color: green, fontSize: 12 }}>WhatsApp</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 392, opacity: detail, transform: "translateY(" + ((1 - detail) * 7) + "px)" }}>
        <div style={{ color: green, fontSize: 12, letterSpacing: ".65px" }}>PEDIDO ESPECIAL</div>
        <div style={{ marginTop: 9, color: ink, fontSize: 21, lineHeight: 1.16, letterSpacing: "-.45px" }}>Cadeira infantil; mesa perto da janela, se possível.</div>
        <div style={{ marginTop: 12, color: muted, fontSize: 14, lineHeight: 1.3 }}>Anotado. A equipe confirma a disponibilidade.</div>
      </div>
    </Canvas>
  );
}
