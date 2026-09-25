// Original artifact with reference-led Remotion components.
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { initAnalytics, trackCtaClicked, trackLandingPageViewed } from "../lib/analytics";
import { LS_REFERRAL_CODE } from "../config/localStorageKeys";
import { MotionDemo } from "./MotionDemo";
import { FloorScene } from "./ServiceScenes";
import { DemoGallery } from "./DemoGallery";
import {
  SchedulePanel,
  DepositPanel,
  KnowledgePanel,
  ReportPanel,
  VoiceScene,
  CarePanel,
} from "./FeaturePanels";
import "./prototype-motion.css";
import "./navigation-refinement.css";

function mount(
  element: Element | null,
  content: ReactNode,
  className?: string
) {
  if (!element) return;
  if (className) element.className = className;
  createRoot(element).render(content);
}
function init() {
  initAnalytics();
  trackLandingPageViewed();
  document.querySelectorAll<HTMLAnchorElement>('a[href="/demo/setup"]').forEach((link) =>
    link.addEventListener("click", () => trackCtaClicked({ cta: "primary", location: "prototype_landing" }))
  );
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref && ref.length <= 20) {
    fetch("/api/referral?action=track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_code: ref }),
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.valid !== true) return;
        localStorage.setItem(LS_REFERRAL_CODE, ref);
        params.delete("ref");
        const query = params.toString();
        history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
      })
      .catch(() => { /* Referral tracking should not block the landing page. */ });
  }
  document.querySelector(".galeria")?.closest("section")?.classList.add("rm-examples-section");
  mount(
    document.querySelector(".galeria"),
    <DemoGallery />,
    "galeria rm-gallery"
  );
  const arts = document.querySelectorAll(".cartao-f .arte");
  const panels = [
    <SchedulePanel />,
    <DepositPanel />,
    <MotionDemo
      component={VoiceScene}
      width={800}
      compactWidth={400}
      height={340}
      label="a voz da casa"
      actionLabel="Ver conversa"
    />,
    <KnowledgePanel />,
    <ReportPanel />,
  ];
  arts.forEach((art, index) => mount(art, panels[index], "arte rm-feature"));
  const bento = document.querySelectorAll(".bento .cima");
  mount(
    bento[0],
    <MotionDemo
      component={FloorScene}
      width={600}
      height={560}
      label="o cuidado com cada mesa"
      still
    />,
    "cima rm-bento-scene"
  );
  mount(bento[1], <CarePanel />, "cima rm-bento-care");
  mount(
    document.querySelector('[data-cena-b="cel"]'),
    <div className="rm-phone">
      <span className="rm-small-label">CASA TUIM · EXEMPLO</span>
      <h4>Seu lugar está guardado.</h4>
      <div className="rm-phone-light">
        <span>Hoje, no jantar</span>
        <strong>20:30</strong>
        <p>Marina · 4 pessoas · Mesa 06</p>
        <div className="rm-phone-orbits" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} style={{ transform: `rotate(${i * 27}deg)` }} />
          ))}
        </div>
      </div>
      <p className="rm-phone-note">Pedido de cadeirão anotado; a equipe confirma.</p>
      <button
        type="button"
        onClick={() =>
          document
            .querySelector<HTMLButtonElement>('.toggle [data-cena="bal"]')
            ?.click()
        }
      >
        Ver o lado da casa <span>↗</span>
      </button>
    </div>
  );
  mount(
    document.querySelector('[data-cena-b="bal"]'),
    <div className="rm-phone">
      <span className="rm-small-label">CASA TUIM · EXEMPLO</span>
      <h4>Prontos para receber.</h4>
      <div className="rm-phone-floor">
        <MotionDemo
          component={FloorScene}
          width={600}
          height={560}
          label="o salão no balcão"
          still
        />
      </div>
    </div>
  );
  const cards = [...document.querySelectorAll<HTMLElement>(".cartao-f")];
  const track = document.querySelector<HTMLElement>(".carrossel .trilho");
  const dots = [
    ...document.querySelectorAll<HTMLButtonElement>(".pontos button"),
  ];
  const sync = () =>
    cards.forEach((card, i) => {
      const active = card.classList.contains("on");
      card.inert = !active;
      card.setAttribute("aria-hidden", String(!active));
      card.id = `rm-feature-${i}`;
      dots[i]?.setAttribute("aria-controls", card.id);
      dots[i]?.setAttribute("aria-selected", String(active));
      if (dots[i]) dots[i].tabIndex = active ? 0 : -1;
    });
  if (track) {
    const size = () => {
      const active = cards.find((card) => card.classList.contains("on"));
      if (!active) return;
      track.style.height = `${
        (active.querySelector<HTMLElement>(".arte")?.offsetHeight || 0) +
        (active.querySelector<HTMLElement>(".texto")?.offsetHeight || 0) +
        2
      }px`;
    };
    new MutationObserver(() => { sync(); size(); }).observe(track, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    sync();
    size();
    const observer = new ResizeObserver(size);
    cards.forEach((card) => {
      const text = card.querySelector(".texto");
      if (text) observer.observe(text);
    });
    document.fonts.ready.then(size);
    window.addEventListener("resize", size, { passive: true });
  }
  dots.forEach((dot, i) =>
    dot.addEventListener("keydown", (event) => {
      if (
        ![
          "ArrowRight",
          "ArrowDown",
          "ArrowLeft",
          "ArrowUp",
          "Home",
          "End",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
          ? dots.length - 1
          : (i +
              (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
              dots.length) %
            dots.length;
      dots[next].click();
      dots[next].focus();
    })
  );
  document.querySelectorAll("form.prompt").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      document.querySelector(".galeria")?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
    })
  );
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
