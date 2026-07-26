import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlideEngine, MiniSlideEngine } from "../SlideEngine";
import { Slide } from "@/app/types/presentation";
import { Template } from "@/app/types/template";

const mockTemplate: Template = {
  id: "corporate",
  name: "Corporate",
  description: "d",
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
  fonts: {
    heading: "Arial",
    body: "Georgia",
  },
  defaultSlides: [],
};

const darkTemplate: Template = {
  ...mockTemplate,
  id: "tech",
  colors: {
    ...mockTemplate.colors,
    background: "#0f172a",
    foreground: "#f8fafc",
    accent: "#06b6d4",
  },
};

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "s1",
    title: "Test Title",
    content: "Test Content",
    layout: "title-content",
    ...overrides,
  };
}

describe("SlideEngine", () => {
  it("renders title layout with title and content", () => {
    const slide = makeSlide({ layout: "title", title: "Hello World", content: "Subtitle here" });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("Subtitle here")).toBeInTheDocument();
  });

  it("renders title-only layout without content when empty", () => {
    const slide = makeSlide({ layout: "title-only", title: "Only Title", content: "" });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Only Title")).toBeInTheDocument();
  });

  it("renders content-only layout", () => {
    const slide = makeSlide({ layout: "content-only", content: "Just content" });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Just content")).toBeInTheDocument();
  });

  it("renders title-content layout with accent underline", () => {
    const slide = makeSlide({ layout: "title-content", title: "TC Title", content: "TC Content" });
    const { container } = render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("TC Title")).toBeInTheDocument();
    expect(screen.getByText("TC Content")).toBeInTheDocument();
    // Check data-layout attribute
    const root = container.querySelector('[data-layout="title-content"]');
    expect(root).toBeInTheDocument();
  });

  it("renders two-column layout splitting content by pipe", () => {
    const slide = makeSlide({
      layout: "two-column",
      title: "Two Col",
      content: "Left side | Right side",
    });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Left side")).toBeInTheDocument();
    expect(screen.getByText("Right side")).toBeInTheDocument();
  });

  it("renders two-column with fallback when no pipe", () => {
    const slide = makeSlide({
      layout: "two-column",
      content: "No split here",
    });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("No split here")).toBeInTheDocument();
  });

  it("renders image-left layout", () => {
    const slide = makeSlide({ layout: "image-left", title: "Img Left", content: "Body text" });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Img Left")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  it("renders image-right layout", () => {
    const slide = makeSlide({ layout: "image-right", title: "Img Right", content: "Body text" });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Img Right")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  it("applies template background color", () => {
    const slide = makeSlide();
    const { container } = render(<SlideEngine slide={slide} template={darkTemplate} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.backgroundColor).toBe("rgb(15, 23, 42)");
  });

  it("applies template foreground color", () => {
    const slide = makeSlide();
    const { container } = render(<SlideEngine slide={slide} template={darkTemplate} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.color).toBe("rgb(248, 250, 252)");
  });

  it("applies template fonts", () => {
    const slide = makeSlide();
    const { container } = render(<SlideEngine slide={slide} template={mockTemplate} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.fontFamily).toBe("Georgia");
  });

  it("sets data-interactive attribute when interactive", () => {
    const slide = makeSlide();
    const { container } = render(<SlideEngine slide={slide} template={mockTemplate} interactive />);
    const root = container.querySelector('[data-interactive="true"]');
    expect(root).toBeInTheDocument();
  });

  it("defaults to title-content for unknown layout", () => {
    const slide = makeSlide({ layout: "title-content" as unknown as Slide["layout"], title: "Fallback" });
    render(<SlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Fallback")).toBeInTheDocument();
  });

  it("renders in mini mode with smaller text when scale < 0.5", () => {
    const slide = makeSlide({ layout: "title", title: "Mini" });
    render(<SlideEngine slide={slide} template={mockTemplate} scale={0.15} />);
    expect(screen.getByText("Mini")).toBeInTheDocument();
  });
});

describe("MiniSlideEngine", () => {
  it("renders with scale 0.15", () => {
    const slide = makeSlide({ title: "Thumb" });
    render(<MiniSlideEngine slide={slide} template={mockTemplate} />);
    expect(screen.getByText("Thumb")).toBeInTheDocument();
  });
});
