import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateSelector } from "@/app/components/TemplateSelector";
import { useTemplateStore } from "@/app/stores/templateStore";

describe("TemplateSelector", () => {
  beforeEach(() => {
    useTemplateStore.setState({
      activeTemplateId: "corporate",
      customTemplates: [],
    });
  });

  it("renders all 3 built-in templates", () => {
    render(<TemplateSelector />);
    expect(screen.getByText("Corporate")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.getByText("Minimal")).toBeInTheDocument();
  });

  it("renders template descriptions", () => {
    render(<TemplateSelector />);
    expect(screen.getByText(/Design professionnel/)).toBeInTheDocument();
    expect(screen.getByText(/Design moderne/)).toBeInTheDocument();
    expect(screen.getByText(/Design épuré/)).toBeInTheDocument();
  });

  it("highlights active template", () => {
    render(<TemplateSelector />);
    const corporateButton = screen.getByText("Corporate").closest("button");
    expect(corporateButton).toHaveClass("ring-1");
  });

  it("switches active template on click", () => {
    render(<TemplateSelector />);
    const techButton = screen.getByText("Tech").closest("button");
    fireEvent.click(techButton!);
    expect(useTemplateStore.getState().activeTemplateId).toBe("tech");
  });

  it("switches to minimal template", () => {
    render(<TemplateSelector />);
    const minimalButton = screen.getByText("Minimal").closest("button");
    fireEvent.click(minimalButton!);
    expect(useTemplateStore.getState().activeTemplateId).toBe("minimal");
  });

  it("renders color preview for each template", () => {
    const { container } = render(<TemplateSelector />);
    const colorPreviews = container.querySelectorAll("[style*='background-color']");
    expect(colorPreviews.length).toBeGreaterThanOrEqual(3);
  });

  it("renders Templates heading", () => {
    render(<TemplateSelector />);
    expect(screen.getByText("Templates")).toBeInTheDocument();
  });
});
