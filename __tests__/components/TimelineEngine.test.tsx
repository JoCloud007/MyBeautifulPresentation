import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TimelineEngine } from "@/app/components/TimelineEngine";
import { TimelineEvent } from "@/app/types/presentation";
import { TemplateColor, TemplateFont } from "@/app/types/template";

const colors: TemplateColor = {
  name: "test",
  background: "#ffffff",
  foreground: "#1a202c",
  accent: "#3b82f6",
  secondary: "#4a5568",
  muted: "#f7f7f9",
  border: "#e2e8f0",
};

const fonts: TemplateFont = { heading: "Geist", body: "Geist" };

function makeEvents(): TimelineEvent[] {
  return [
    { id: "e1", date: "2024-01-15", title: "Kick-off" },
    { id: "e2", date: "2024-05-30", title: "Migration" },
    { id: "e3", date: "2024-09-30", title: "Atteinte des objectifs" },
  ];
}

function dateLabels(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("span")).filter((s) =>
    /^\d{2}\/\d{2}\/\d{4}$/.test(s.textContent ?? "")
  ) as HTMLElement[];
}

describe("TimelineEngine", () => {
  it("renders one date label per event, sorted chronologically", () => {
    const { container } = render(
      <TimelineEngine events={makeEvents()} colors={colors} fonts={fonts} scale={1} />
    );

    expect(dateLabels(container).map((el) => el.textContent)).toEqual([
      "15/01/2024",
      "30/05/2024",
      "30/09/2024",
    ]);
  });

  it("anchors every event group on the central axis", () => {
    const { container } = render(
      <TimelineEngine events={makeEvents()} colors={colors} fonts={fonts} scale={1} />
    );

    const groups = dateLabels(container).map((el) => el.parentElement!.parentElement!);

    for (const group of groups) {
      // Zero-height group sitting at 50% of the body: the dot is pinned to the axis
      // whatever the height of the label block.
      expect(group.style.top).toBe("50%");
      expect(group.style.height).toBe("0px");
    }
  });

  it("stacks labels away from the axis, alternating above and below", () => {
    const { container } = render(
      <TimelineEngine events={makeEvents()} colors={colors} fonts={fonts} scale={1} />
    );

    const blocks = dateLabels(container).map((el) => el.parentElement!);

    expect(blocks[0].style.bottom).toBe("0px");
    expect(blocks[1].style.top).toBe("0px");
    expect(blocks[2].style.bottom).toBe("0px");
  });

  it("separates each date from the axis with a connector on the axis side", () => {
    const { container } = render(
      <TimelineEngine events={makeEvents()} colors={colors} fonts={fonts} scale={1} />
    );

    const blocks = dateLabels(container).map((el) => el.parentElement!);
    const above = blocks[0];
    const below = blocks[1];

    // Above: the connector is the last child, its bottom edge on the axis.
    expect((above.lastElementChild as HTMLElement).style.height).toBe("14px");
    // Below: the connector comes first, so the date starts under it.
    expect((below.firstElementChild as HTMLElement).style.height).toBe("14px");
  });

  it("keeps the axis and the scale markers inside the same inset", () => {
    const { container } = render(
      <TimelineEngine events={makeEvents()} colors={colors} fonts={fonts} scale={1} />
    );

    const axis = Array.from(container.querySelectorAll("div")).find(
      (d) => d.style.left === "4%" && d.style.right === "4%" && d.style.top === "50%"
    );

    expect(axis).toBeTruthy();
  });

  it("hides the labels in mini mode but keeps the dots", () => {
    const { container } = render(
      <TimelineEngine events={makeEvents()} colors={colors} fonts={fonts} scale={0.2} />
    );

    expect(dateLabels(container)).toHaveLength(0);

    const dots = Array.from(container.querySelectorAll("div")).filter(
      (d) => d.style.width === "8px" && d.style.height === "8px"
    );
    expect(dots).toHaveLength(3);
  });
});
