import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoGallery } from "../DemoGallery";
vi.mock("../MotionDemo", () => ({
  MotionDemo: ({ label, still }: { label: string; still?: boolean }) => (
    <div data-testid="demo-player" data-still={String(Boolean(still))}>
      {label}
    </div>
  ),
}));
describe("restaurant demonstration gallery", () => {
  it("switches examples with arrow keys and mounts only the selected illustration", () => {
    render(<DemoGallery />);
    const booking = screen.getByRole("tab", { name: /Casa Tuim/ });
    fireEvent.keyDown(booking, { key: "ArrowRight" });
    const arrival = screen.getByRole("tab", { name: /Bar do Zé/ });
    expect(arrival).toHaveFocus();
    expect(arrival).toHaveAttribute("aria-selected", "true");
    expect(booking).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByTestId("demo-player")).toHaveLength(1);
    expect(screen.getByTestId("demo-player")).toHaveTextContent("Bar do Zé");
    fireEvent.keyDown(arrival, { key: "End" });
    expect(screen.getByTestId("demo-player")).toHaveAttribute(
      "data-still",
      "true"
    );
    fireEvent.keyDown(screen.getByRole("tab", { name: /Cantina Orla/ }), {
      key: "Home",
    });
    expect(booking).toHaveFocus();
  });
  it("connects the selected restaurant tab to its visible panel", () => {
    render(<DemoGallery />);
    const service = screen.getByRole("tab", { name: /Cantina Orla/ });
    fireEvent.click(service);
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      service.id
    );
    expect(
      screen.getByRole("heading", { name: "O salão inteiro. Num olhar." })
    ).toBeVisible();
    const arrivals = screen.getByRole("tab", { name: /Bar do Zé/ });
    arrivals.focus();
    fireEvent.keyDown(arrivals, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /Casa Tuim/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});
