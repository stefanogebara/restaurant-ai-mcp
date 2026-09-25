import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionDemo } from "../MotionDemo";
const runtime = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  getCurrentFrame: vi.fn(() => 90),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));
vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef<
      unknown,
      { compositionWidth: number; compositionHeight: number; initialFrame: number }
    >((props, ref) => {
      React.useImperativeHandle(ref, () => runtime);
      return (
        <div
          data-testid="player"
          data-width={props.compositionWidth}
          data-height={props.compositionHeight}
          data-initial-frame={props.initialFrame}
        />
      );
    }),
    Thumbnail: () => <div data-testid="thumbnail" />,
  };
});
let intersect: (visible: boolean) => void;
let reduce = false;
let resize: (width: number) => void;
const Scene = () => null;
beforeEach(() => {
  vi.clearAllMocks();
  reduce = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeObserverCallback) {
        resize = (width) =>
          cb(
            [{ contentRect: { width } } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduce,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersect = (visible) =>
          cb(
            [{ isIntersecting: visible } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("MotionDemo playback lifecycle", () => {
  it("advances through meaningful stages and returns to the first stage", () => {
    runtime.getCurrentFrame
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(36)
      .mockReturnValueOnce(90);
    render(
      <MotionDemo
        component={Scene}
        width={600}
        height={440}
        label="reserva"
        controlsPlacement="below"
        stepFrames={[0, 36, 90]}
      />
    );
    const next = screen.getByRole("button", {
      name: "Próxima etapa de reserva",
    });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(runtime.seekTo.mock.calls.map(([frame]) => frame)).toEqual([
      36, 90, 0,
    ]);
    expect(screen.getByRole("group")).toHaveAttribute("data-playing", "false");
  });
  it("exposes descriptive controls below the illustration and pauses when stepping", () => {
    render(
      <MotionDemo
        component={Scene}
        width={600}
        height={560}
        label="reserva"
        actionLabel="Ver reserva"
        controlsPlacement="below"
      />
    );
    act(() => intersect(true));
    expect(screen.getByText("Demonstração ilustrativa")).toBeVisible();
    const step = screen.getByRole("button", {
      name: "Avançar um segundo de reserva",
    });
    expect(step).toHaveTextContent("+1 s");
    fireEvent.click(step);
    expect(runtime.seekTo).toHaveBeenCalledWith(120);
    expect(screen.getByRole("group")).toHaveAttribute("data-playing", "false");
    expect(
      screen.getByRole("button", { name: "Reproduzir reserva" })
    ).toHaveTextContent("Ver reserva");
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir reserva" }));
    expect(
      screen.getByRole("button", { name: "Pausar reserva" })
    ).toHaveTextContent("Pausar");
  });
  it("reflows a compact composition without shrinking desktop typography", () => {
    render(
      <MotionDemo
        component={Scene}
        width={800}
        compactWidth={400}
        height={480}
        compactHeight={560}
        label="voz"
      />
    );
    act(() => resize(342));
    expect(screen.getByTestId("player")).toHaveAttribute("data-width", "400");
    expect(screen.getByTestId("player")).toHaveAttribute("data-height", "560");
    act(() => resize(760));
    expect(screen.getByTestId("player")).toHaveAttribute("data-width", "800");
    expect(screen.getByTestId("player")).toHaveAttribute("data-height", "480");
  });
  it("plays only while visible and honours manual pause", () => {
    render(
      <MotionDemo component={Scene} width={600} height={560} label="reserva" />
    );
    expect(runtime.play).not.toHaveBeenCalled();
    act(() => intersect(true));
    expect(runtime.play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Pausar reserva" }));
    expect(screen.getByRole("group")).toHaveAttribute("data-playing", "false");
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir reserva" }));
    act(() => intersect(false));
    expect(screen.getByRole("group")).toHaveAttribute("data-playing", "false");
  });
  it("holds a one-shot demonstration on its final frame and replays from zero", () => {
    render(
      <MotionDemo component={Scene} width={600} height={430} label="reserva" loop={false} />
    );
    act(() => intersect(true));
    const ended = runtime.addEventListener.mock.calls.find(([name]) => name === "ended")?.[1];
    expect(ended).toBeTypeOf("function");
    act(() => ended());
    expect(screen.getByRole("group")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("button", { name: "Reproduzir reserva" })).toHaveTextContent("Rever");
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir reserva" }));
    expect(runtime.seekTo).toHaveBeenCalledWith(0);
    expect(screen.getByRole("group")).toHaveAttribute("data-playing", "true");
  });
  it("starts still with reduced motion and permits deliberate playback or stepping", () => {
    reduce = true;
    render(
      <MotionDemo component={Scene} width={600} height={560} label="reserva" />
    );
    act(() => intersect(true));
    expect(runtime.play).not.toHaveBeenCalled();
    expect(screen.getByTestId("player")).toHaveAttribute("data-initial-frame", "90");
    fireEvent.click(
      screen.getByRole("button", { name: "Avançar um segundo de reserva" })
    );
    expect(runtime.seekTo).toHaveBeenCalledWith(120);
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir reserva" }));
    expect(runtime.play).toHaveBeenCalledOnce();
  });
  it("pauses an inactive carousel slide even when its bounds are visible", async () => {
    const { container } = render(
      <article className="cartao-f">
        <MotionDemo component={Scene} width={600} height={560} label="voz" />
      </article>
    );
    act(() => intersect(true));
    expect(runtime.play).not.toHaveBeenCalled();
    act(() => container.querySelector("article")!.classList.add("on"));
    await waitFor(() => expect(runtime.play).toHaveBeenCalledOnce());
    act(() => container.querySelector("article")!.classList.remove("on"));
    await waitFor(() =>
      expect(screen.getByRole("group")).toHaveAttribute("data-playing", "false")
    );
  });
});
