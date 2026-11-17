import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlideRenderer } from "@/app/components/SlideRenderer";
import type { Slide } from "@/app/types/presentation";
import type { Template } from "@/app/types/template";

const template: Template = {
  id: "corporate",
  name: "Corporate",
  description: "Test template",
  category: "corporate",
  colors: {
    name: "corporate",
    background: "#ffffff",
    foreground: "#1a1a2e",
    accent: "#1e40af",
    secondary: "#64748b",
    muted: "#f1f5f9",
    border: "#e2e8f0",
  },
  fonts: { heading: "Inter, sans-serif", body: "Georgia, serif" },
  fontSizes: { heading: 48, body: 18 },
  defaultSlides: [{ layout: "title" }],
};

function slideWith(elements: Slide["elements"]): Slide {
  return {
    id: "s1",
    title: "Titre",
    content: "",
    layout: "content-only",
    elements,
  };
}

describe("SlideRenderer — éléments image", () => {
  it("rend une image au lieu du placeholder « Image »", () => {
    const { container } = render(
      <SlideRenderer
        slide={slideWith([
          {
            id: "im1",
            type: "image",
            x: 10,
            y: 10,
            w: 40,
            h: 40,
            content: "data:image/png;base64,AAA",
          },
        ])}
        template={template}
        mode="export"
      />
    );

    const nodes = Array.from(container.querySelectorAll<HTMLElement>("div"));
    const withBg = nodes.find((el) =>
      (el.style.backgroundImage || "").includes("data:image/png;base64,AAA")
    );
    expect(withBg).toBeDefined();
    expect(screen.queryByText("Image")).not.toBeInTheDocument();
  });

  it("garde le placeholder quand l'élément image n'a pas de contenu", () => {
    render(
      <SlideRenderer
        slide={slideWith([
          { id: "im2", type: "image", x: 10, y: 10, w: 20, h: 20, content: "" },
        ])}
        template={template}
        mode="export"
      />
    );
    expect(screen.getByText("Image")).toBeInTheDocument();
  });
});
