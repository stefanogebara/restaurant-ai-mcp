import { useRef, useState } from "react";
import { MotionDemo } from "./MotionDemo";
import { ReservationScene, QueueScene, FloorScene } from "./ServiceScenes";
import "./showcase-refinement.css";

const examples = [
  {
    name: "Casa Tuim",
    category: "Reservas",
    title: "O pedido chega ao salão.",
    body: "",
    quote: "Vamos com uma criança. Pode ser perto da janela?",
    attribution: "Marina, ao reservar",
    component: ReservationScene,
    width: 760,
    height: 370,
  },
  {
    name: "Bar do Zé",
    category: "Chegadas",
    title: "A espera pode ser um passeio.",
    body: "Joana saiu para passear. Quando a mesa ficou pronta, o convite chegou pelo WhatsApp. Sem nomes gritados na porta.",
    quote: "A gente vai dar uma volta. Vocês avisam por aqui?",
    attribution: "Joana, enquanto espera",
    component: QueueScene,
    width: 340,
    height: 520,
  },
  {
    name: "Cantina Orla",
    category: "Salão",
    title: "O salão inteiro. Num olhar.",
    body: "Quem recebe sabe qual mesa está livre e quem chega a seguir. O próximo passo fica claro para toda a equipe.",
    quote: "O Rafael chegou. A mesa dele já está pronta?",
    attribution: "Na recepção, às 20:30",
    component: FloorScene,
    width: 600,
    height: 560,
  },
];
export function DemoGallery() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const example = examples[selected];
  return (
    <div className={`rm-showcase${selected === 0 ? " rm-showcase-reservation" : ""}`}>
      {selected === 0 && (
        <div className="rm-gallery-headline">
          <span>01 / Reservas</span>
          <h3>{example.title}</h3>
        </div>
      )}
      <div
        className="rm-gallery-tabs"
        role="tablist"
        aria-label="Restaurantes de demonstração"
      >
        {examples.map((item, index) => (
          <button
            key={item.name}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            id={`example-tab-${index}`}
            type="button"
            role="tab"
            aria-label={`${item.name} — ${item.category}`}
            aria-selected={selected === index}
            aria-controls="example-panel"
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              let next = selected;
              if (event.key === "ArrowRight")
                next = (index + 1) % examples.length;
              else if (event.key === "ArrowLeft")
                next = (index + examples.length - 1) % examples.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = examples.length - 1;
              else return;
              event.preventDefault();
              setSelected(next);
              tabs.current[next]?.focus();
            }}
          >
            <small>
              <span aria-hidden="true">0{index + 1}</span>
              {item.category}
            </small>
            <span>{item.name}</span>
            <svg
              className="rm-house-arrow"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 10h12M11 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>
        ))}
      </div>
      <div
        className="rm-gallery-panel"
        id="example-panel"
        role="tabpanel"
        aria-labelledby={`example-tab-${selected}`}
        tabIndex={0}
      >
        <div
          className={`rm-gallery-art ${
            selected === 1 ? "rm-gallery-arrival" : ""
          }`}
        >
          <div
            className={`rm-gallery-screen ${
              selected === 2 ? "rm-gallery-static" : ""
            } ${selected !== 1 ? "rm-gallery-booking" : ""} ${
              selected === 0 ? "rm-gallery-reservation" : ""
            }`}
            style={{ aspectRatio: `${example.width}/${example.height}` }}
          >
            <MotionDemo
              key={selected}
              component={example.component}
              width={example.width}
              compactWidth={selected === 0 ? 400 : selected === 2 ? 400 : undefined}
              compactHeight={selected === 0 ? 510 : selected === 2 ? 560 : undefined}
              controlsPlacement="below"
              stepFrames={[0, 36, 90]}
              showStepControl={false}
              height={example.height}
              label={`a demonstração de ${example.name}`}
              actionLabel={selected === 0 ? "Ver a reserva aparecer" : "Ver acontecer"}
              still={selected === 2}
              loop={selected !== 0}
              previewFrame={selected === 0 ? 90 : undefined}
            />
          </div>
        </div>
        <div className="rm-gallery-story">
          {selected !== 0 && <h3>{example.title}</h3>}
          {example.body && <p>{example.body}</p>}
          {selected === 0 ? (
            <figure className="rm-request-origin">
              <figcaption>Marina · WhatsApp · 18:42</figcaption>
              <blockquote>“Somos quatro. Tem cadeira infantil e mesa perto da janela?”</blockquote>
            </figure>
          ) : (
            <figure className="rm-guest-note">
              <blockquote>“{example.quote}”</blockquote>
              <figcaption>{example.attribution}</figcaption>
            </figure>
          )}
        </div>
      </div>
    </div>
  );
}
