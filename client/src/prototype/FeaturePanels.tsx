import { useState } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { DotNumber } from "./ServiceScenes";
function Dots({ value }: { value: string }) {
  return (
    <div className="rm-digits">
      <DotNumber
        value={value}
        height={70}
        color="currentColor"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
export function SchedulePanel() {
  return (
    <div className="rm-panel rm-schedule">
      <div className="rm-service-heading">
        <div><strong>Casa Tuim</strong><span>Quinta-feira · jantar</span></div>
        <span>3 reservas</span>
      </div>
      <div className="rm-service-body">
        <div className="rm-service-timeline">
          <div className="rm-schedule-head">
            <span>Mesa</span><span>19h</span><span>20h</span><span>21h</span><span>22h</span>
          </div>
          {[
            ["02", "Marina · 4", "20h"],
            ["04", "Aldo · 2", "19h20"],
            ["06", "Nara · 4", "20h40"],
          ].map(([table, name, time], i) => (
            <div className="rm-schedule-row" key={table}>
              <span>{table}</span>
              <div>
                <span className={`rm-booking rm-booking-${i}`}>{name}<small>{time}</small></span>
              </div>
            </div>
          ))}
        </div>
        <aside className="rm-service-detail" aria-label="Detalhes da reserva selecionada">
          <div className="rm-service-detail-top"><span>RESERVA SELECIONADA</span><span>01 / 03</span></div>
          <strong>Marina</strong>
          <p className="rm-service-facts">20h · 4 pessoas · mesa 02</p>
          <div className="rm-service-note"><span>PEDIDO ESPECIAL</span><p>Cadeira infantil e mesa perto da janela, se possível.</p></div>
          <p className="rm-service-pending">A equipe confirma a disponibilidade.</p>
        </aside>
      </div>
    </div>
  );
}
export function DepositPanel() {
  const [refunded, setRefunded] = useState(false);
  return (
    <div className="rm-panel rm-deposit">
      <div className="rm-deposit-instrument">
        <div>Sinal da reserva</div>
        <div className="rm-money">
          <small>R$</small>
          <Dots value="80" />
        </div>
        <span className="rm-deposit-state">
          {refunded ? "Devolução simulada" : "Recebido via Pix"}
        </span>
        <svg viewBox="0 0 280 50" aria-hidden="true">
          {Array.from({ length: 33 }, (_, i) => (
            <line
              key={i}
              x1={i * 8 + 8}
              x2={i * 8 + 8}
              y1={i === 16 ? 5 : 28}
              y2="45"
              stroke="currentColor"
              opacity={i === 16 ? 1 : 0.35}
            />
          ))}
        </svg>
      </div>
      <div className="rm-deposit-detail">
        <span className="rm-small-label">CASA TUIM · MESA 06</span>
        <h4>
          O combinado,
          <br />
          bem guardado.
        </h4>
        <p>
          Um sinal para confirmar.
          <br />
          Uma devolução quando for preciso.
        </p>
        <button type="button" onClick={() => setRefunded(!refunded)}>
          {refunded ? "Recomeçar exemplo" : "Simular devolução"}
          <span>↗</span>
        </button>
        <span className="rm-sr-only" role="status">
          {refunded
            ? "Devolução de 80 reais simulada."
            : "Sinal ilustrativo recebido."}
        </span>
      </div>
    </div>
  );
}
export function KnowledgePanel() {
  return (
    <div className="rm-panel rm-knowledge">
      <div className="rm-panel-top">
        <span>O conhecimento da casa</span>
        <span className="rm-small-pill">Sempre por perto</span>
      </div>
      <div className="rm-knowledge-grid">
        {[
          ["Cardápio", "Ingredientes, pratos e cuidados", "menu"],
          ["Horários", "Cada turno, cada ocasião", "clock"],
          ["A casa", "Endereço e como chegar", "place"],
        ].map(([title, body, type]) => (
          <div className="rm-source" key={title}>
            <div
              className={`rm-source-art rm-source-${type}`}
              aria-hidden="true"
            >
              {type === "menu" ? (
                <>
                  <i />
                  <i />
                  <i />
                </>
              ) : type === "clock" ? (
                <svg viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="27" />
                  <path d="M40 21V40L54 47" />
                  <circle cx="40" cy="40" r="3" />
                </svg>
              ) : (
                <svg viewBox="0 0 80 80">
                  <path d="M40 65S18 42 18 29a22 22 0 1 1 44 0C62 42 40 65 40 65Z" />
                  <circle cx="40" cy="29" r="8" />
                </svg>
              )}
            </div>
            <h4>{title}</h4>
            <p>{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
export function ReportPanel() {
  return (
    <div className="rm-panel rm-report">
      <div className="rm-panel-top">
        <span>A noite, em perspectiva.</span>
        <span className="rm-small-pill">23:04 · exemplo</span>
      </div>
      <div className="rm-report-grid">
        <div className="rm-report-light">
          <span>Pessoas recebidas</span>
          <Dots value="92" />
          <div className="rm-report-bars" aria-hidden="true">
            {[
              14, 21, 17, 31, 39, 35, 49, 56, 44, 64, 54, 75, 70, 59, 85, 69,
              48, 34, 24,
            ].map((h, i) => (
              <i key={i} style={{ height: h }} />
            ))}
          </div>
        </div>
        <div className="rm-report-stat">
          <span>Tempo médio à mesa</span>
          <strong>1h38</strong>
          <svg viewBox="0 0 190 50" aria-hidden="true">
            <path d="M0 40C24 40 23 4 45 7S77 51 100 32S131 9 145 20S170 48 190 18" />
          </svg>
          <small>Um salão que encontra seu ritmo.</small>
        </div>
        <div className="rm-report-stat">
          <span>Reservas presentes</span>
          <strong>
            30<span>/31</span>
          </strong>
          <div className="rm-attendance" aria-hidden="true">
            {Array.from({ length: 31 }, (_, i) => (
              <i key={i} style={{ opacity: i === 30 ? 0.18 : 1 }} />
            ))}
          </div>
          <small>Cada chegada, registrada.</small>
        </div>
      </div>
    </div>
  );
}
export function VoiceScene() {
  const { width } = useVideoConfig();
  const compact = width < 500;
  const frame = useCurrentFrame();
  const phase = (frame / 240) * Math.PI * 2;
  return (
    <AbsoluteFill
      style={{
        background: "#ecece8",
        fontFamily: "Instrument Sans, sans-serif",
        padding: compact ? "26px 24px" : "30px 42px",
        color: "#383c36",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 17,
        }}
      >
        <span>A voz da casa</span>
      </div>
      <div
        style={{
          position: "absolute",
          inset: compact ? "76px 18px 18px" : "76px 35px 25px",
          borderRadius: 24,
          background:
            "radial-gradient(ellipse at 50% 130%, #e9bc59 0%, #cad9a7 33%, #e9eade 75%)",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 720 190"
          style={{ position: "absolute", width: "100%", height: 175, top: 5 }}
          aria-hidden="true"
        >
          {Array.from({ length: 6 }, (_, i) => {
            const pts = Array.from({ length: 100 }, (_, x) => {
              const xx = (x / 99) * 720;
              const envelope = Math.sin((x / 99) * Math.PI);
              return `${xx},${
                95 +
                Math.sin(
                  (x / 99) * Math.PI * (3 + i * 0.12) + phase + i * 0.45
                ) *
                  envelope *
                  (23 + i * 7)
              }`;
            });
            return (
              <polyline
                key={i}
                points={pts.join(" ")}
                fill="none"
                stroke="#fffef1"
                strokeWidth="1.25"
                opacity={0.6 + i * 0.06}
              />
            );
          })}
          <circle
            cx={360 + Math.sin(phase) * 150}
            cy={95 + Math.sin(phase * 2) * 20}
            r="7"
            fill="#e2fc48"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            bottom: 25,
            left: 30,
            right: 30,
            fontSize: compact ? 23 : 26,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          “Tem uma mesa para quatro?”
        </div>
      </div>
    </AbsoluteFill>
  );
}
export function CarePanel() {
  return (
    <div className="rm-care">
      <span className="rm-small-label">UM PEDIDO, TODOS OS CUIDADOS</span>
      <h4>
        Uma mesa para quatro.
        <br />E espaço para o pequeno.
      </h4>
      <div className="rm-care-orbit" aria-hidden="true">
        <svg viewBox="0 0 340 140">
          {Array.from({ length: 7 }, (_, i) => (
            <ellipse
              key={i}
              cx="170"
              cy="70"
              rx={50 + i * 11}
              ry={55 - i * 5}
              transform={`rotate(${i * 12} 170 70)`}
            />
          ))}
          <circle cx="170" cy="70" r="8" />
        </svg>
      </div>
      <div className="rm-care-foot">
        <span>4 pessoas</span>
        <span>Cadeirão solicitado</span>
        <span>Mesa 02</span>
      </div>
    </div>
  );
}
