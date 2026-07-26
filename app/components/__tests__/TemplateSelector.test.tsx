import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateSelector } from "../TemplateSelector";
import { useTemplateStore, getActiveTemplate } from "../../stores/templateStore";

function resetStore() {
  localStorage.clear();
  useTemplateStore.setState({
    activeTemplateId: "corporate",
    customTemplates: [],
  });
}

describe("TemplateSelector", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders all 3 built-in templates", () => {
    render(<TemplateSelector />);
    expect(screen.getByText("Corporate")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.getByText("Minimal")).toBeInTheDocument();
  });

  it("shows template descriptions", () => {
    render(<TemplateSelector />);
    expect(screen.getByText(/professionnel et élégant/)).toBeInTheDocument();
    expect(screen.getByText(/moderne et dynamique/)).toBeInTheDocument();
    expect(screen.getByText(/épuré et minimaliste/)).toBeInTheDocument();
  });

  it("highlights corporate as active by default", () => {
    const { container } = render(<TemplateSelector />);
    const buttons = container.querySelectorAll("button");
    const corporateBtn = Array.from(buttons).find((b) => b.textContent?.includes("Corporate"));
    expect(corporateBtn).toBeDefined();
    expect(corporateBtn!.className).toContain("ring-1");
  });

  it("switches to tech template when clicked", () => {
    render(<TemplateSelector />);
    const techBtn = screen.getByText("Tech").closest("button")!;
    fireEvent.click(techBtn);
    const state = useTemplateStore.getState();
    expect(state.activeTemplateId).toBe("tech");
    expect(getActiveTemplate(state).id).toBe("tech");
  });

  it("switches to minimal template when clicked", () => {
    render(<TemplateSelector />);
    const minimalBtn = screen.getByText("Minimal").closest("button")!;
    fireEvent.click(minimalBtn);
    expect(useTemplateStore.getState().activeTemplateId).toBe("minimal");
  });

  it("switches back to corporate", () => {
    render(<TemplateSelector />);
    fireEvent.click(screen.getByText("Tech").closest("button")!);
    fireEvent.click(screen.getByText("Corporate").closest("button")!);
    expect(useTemplateStore.getState().activeTemplateId).toBe("corporate");
  });

  it("renders color preview swatches", () => {
    const { container } = render(<TemplateSelector />);
    const swatches = container.querySelectorAll('[style*="background-color"]');
    expect(swatches.length).toBeGreaterThanOrEqual(3);
  });
});
