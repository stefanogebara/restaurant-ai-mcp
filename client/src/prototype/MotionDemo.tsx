import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Player, Thumbnail } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";

type Props = {
  component: ComponentType;
  width: number;
  height: number;
  label: string;
  still?: boolean;
  compactWidth?: number;
  compactHeight?: number;
  stepFrames?: readonly number[];
  showStepControl?: boolean;
  actionLabel?: string;
  controlsPlacement?: "overlay" | "below";
  loop?: boolean;
  previewFrame?: number;
};
/** Frame-based illustrations: pause offscreen, honour reduced motion, allow deliberate playback. */
export function MotionDemo({
  component,
  width,
  height,
  label,
  still = false,
  compactWidth,
  compactHeight,
  stepFrames,
  showStepControl = true,
  actionLabel = "Ver cena",
  controlsPlacement = "overlay",
  loop = true,
  previewFrame,
}: Props) {
  const requestedFrame = new URLSearchParams(window.location.search).get(
    "frame"
  );
  const auditFrame =
    requestedFrame !== null &&
    /^\d+$/.test(requestedFrame) &&
    Number(requestedFrame) < 240
      ? Number(requestedFrame)
      : null;
  const initialFrame =
    auditFrame ??
    previewFrame ??
    (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 90 : 0);
  const root = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const [paused, setPaused] = useState(
    () =>
      auditFrame !== null ||
      previewFrame !== undefined ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [previewPending, setPreviewPending] = useState(
    previewFrame !== undefined && auditFrame === null
  );
  const [compositionWidth, setCompositionWidth] = useState(width);
  const [compositionHeight, setCompositionHeight] = useState(height);
  useEffect(() => {
    if (!compactWidth || !root.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setCompositionWidth(entry.contentRect.width < 500 ? compactWidth : width);
      setCompositionHeight(
        entry.contentRect.width < 500 ? compactHeight ?? height : height
      );
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [width, compactWidth, compactHeight, height]);
  const [visible, setVisible] = useState(false);
  const [slideActive, setSlideActive] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [frame, setFrame] = useState(initialFrame);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (still || loop) return;
    const node = player.current;
    const onEnded = () => { setEnded(true); setPaused(true); };
    node?.addEventListener("ended", onEnded);
    return () => node?.removeEventListener("ended", onEnded);
  }, [still, loop]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 }
    );
    observer.observe(node);
    const slide = node.closest(".cartao-f");
    const syncSlide = () =>
      setSlideActive(!slide || slide.classList.contains("on"));
    const slideObserver = new MutationObserver(syncSlide);
    if (slide)
      slideObserver.observe(slide, {
        attributes: true,
        attributeFilter: ["class"],
      });
    syncSlide();
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = () => {
      if (query.matches) setPaused(true);
    };
    const visibility = () => setPageVisible(!document.hidden);
    query.addEventListener("change", reduce);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      slideObserver.disconnect();
      query.removeEventListener("change", reduce);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (still) return;
    if (visible && pageVisible && slideActive && !paused && !ended)
      player.current?.play();
    else player.current?.pause();
  }, [visible, pageVisible, slideActive, paused, still, ended]);
  const playing = !still && visible && pageVisible && slideActive && !paused && !ended;
  return (
    <div
      className={`rm-film${
        controlsPlacement === "below" ? " rm-controls-below" : ""
      }`}
      ref={root}
      role="group"
      aria-label={label}
      data-playing={String(playing)}
    >
      <div className="rm-canvas" aria-hidden="true">
        {still ? (
          <Thumbnail
            component={component}
            frameToDisplay={90}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            durationInFrames={240}
            fps={30}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Player
            ref={player}
            component={component}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            durationInFrames={240}
            fps={30}
            initialFrame={initialFrame}
            loop={loop}
            moveToBeginningWhenEnded={false}
            controls={false}
            autoPlay={false}
            clickToPlay={false}
            numberOfSharedAudioTags={0}
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
      {!still && (
        <div className="rm-film-controls">
          {controlsPlacement === "below" && (
            <span className="rm-film-disclaimer">Demonstração ilustrativa</span>
          )}
          <button
            className="rm-play-action"
            type="button"
            title={`${paused ? "Reproduzir" : "Pausar"} ${label}`}
            aria-label={`${paused ? "Reproduzir" : "Pausar"} ${label}`}
            onClick={() => {
              if (previewPending) {
                player.current?.seekTo(0);
                setPreviewPending(false);
                setPaused(false);
              } else if (ended) {
                player.current?.seekTo(0);
                setEnded(false);
                setPaused(false);
              } else setPaused(!paused);
            }}
          >
            {paused ? (
              <svg viewBox="0 0 16 16">
                <path d="m5 3 7 5-7 5Z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16">
                <path
                  d="M5 3v10M11 3v10"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            )}
            <span>{paused ? (ended ? "Rever" : actionLabel) : "Pausar"}</span>
          </button>
          {showStepControl && (
            <button
              type="button"
              title="Avançar a demonstração em um segundo"
              aria-label={
                stepFrames
                  ? `Próxima etapa de ${label}`
                  : `Avançar um segundo de ${label}`
              }
              onClick={() => {
                setPaused(true);
                const current = player.current?.getCurrentFrame() ?? frame;
                const next = stepFrames?.length
                  ? stepFrames.find((value) => value > current) ?? stepFrames[0]
                  : (current + 30) % 240;
                setFrame(next);
                player.current?.seekTo(next);
              }}
            >
              <svg viewBox="0 0 16 16">
                <path
                  d="m4 3 6 5-6 5M12 3v10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              {controlsPlacement === "below" && (
                <span>{stepFrames ? "Próxima etapa" : "+1 s"}</span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
