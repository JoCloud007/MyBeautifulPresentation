import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "@/app/components/Toolbar";
import { usePresentationStore } from "@/app/stores/presentationStore";

vi.mock("@/lib/pptxExport", () => ({
  exportToPPTX: vi.fn(),
}));

describe("Toolbar — Docker Compose & UI Polish", () => {
  beforeEach(() => {
    usePresentationStore.setState({
      presentation: {
        id: "pres-1",
        title: "Ma Présentation",
        subtitle: "Sous-titre",
        author: "Auteur",
        slides: [
          { id: "s1", title: "Slide 1", content: "C1", layout: "title" },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
    });
  });

  it("renders app name and logo", () => {
    render(<Toolbar />);
    expect(screen.getByText("MyBeautifulPresentation")).toBeInTheDocument();
  });

  it("renders current presentation title", () => {
    render(<Toolbar />);
    expect(screen.getByText("Ma Présentation")).toBeInTheDocument();
  });

  it("allows editing the presentation title", () => {
    render(<Toolbar />);
    const titleButton = screen.getByText("Ma Présentation");
    fireEvent.click(titleButton);
    const input = screen.getByDisplayValue("Ma Présentation");
    expect(input).toBeInTheDocument();
  });

  it("has a Nouveau button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Nouveau")).toBeInTheDocument();
  });

  it("has an Importer button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Importer")).toBeInTheDocument();
  });

  it("has an Exporter button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Exporter")).toBeInTheDocument();
  });

  it("has a settings button for LLM config", () => {
    render(<Toolbar />);
    const settingsBtn = screen.getByTitle("Configuration LLM");
    expect(settingsBtn).toBeInTheDocument();
  });

  it("has a Métadonnées button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Métadonnées")).toBeInTheDocument();
  });

  it("clicking Nouveau resets the presentation", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("Nouveau"));
    const state = usePresentationStore.getState();
    expect(state.presentation!.title).toBe("Nouvelle Présentation");
    expect(state.presentation!.slides).toHaveLength(1);
  });
});
