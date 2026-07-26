import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideEditor } from "@/app/components/SlideEditor";
import { usePresentationStore } from "@/app/stores/presentationStore";

describe("SlideEditor — Docker Compose & UI Polish", () => {
  beforeEach(() => {
    usePresentationStore.setState({
      presentation: {
        id: "pres-1",
        title: "Test",
        slides: [
          {
            id: "s1",
            title: "Titre de test",
            content: "Contenu de test",
            layout: "title-content",
            notes: "Note initiale",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
    });
  });

  it("renders the editor header", () => {
    render(<SlideEditor />);
    expect(screen.getByText("Éditeur de slide")).toBeInTheDocument();
  });

  it("shows current slide counter", () => {
    render(<SlideEditor />);
    expect(screen.getByText("Slide 1 / 1")).toBeInTheDocument();
  });

  it("renders layout selector", () => {
    render(<SlideEditor />);
    expect(screen.getByText("Mise en page")).toBeInTheDocument();
  });

  it("renders title input with current value", () => {
    render(<SlideEditor />);
    const input = screen.getByDisplayValue("Titre de test");
    expect(input).toBeInTheDocument();
  });

  it("renders content textarea with current value", () => {
    render(<SlideEditor />);
    const textarea = screen.getByDisplayValue("Contenu de test");
    expect(textarea).toBeInTheDocument();
  });

  it("renders notes textarea with current value", () => {
    render(<SlideEditor />);
    const textarea = screen.getByDisplayValue("Note initiale");
    expect(textarea).toBeInTheDocument();
  });

  it("updates slide title on input change", () => {
    render(<SlideEditor />);
    const input = screen.getByDisplayValue("Titre de test");
    fireEvent.change(input, { target: { value: "Nouveau titre" } });
    expect(usePresentationStore.getState().presentation!.slides[0].title).toBe("Nouveau titre");
  });

  it("updates slide content on textarea change", () => {
    render(<SlideEditor />);
    const textarea = screen.getByDisplayValue("Contenu de test");
    fireEvent.change(textarea, { target: { value: "Nouveau contenu" } });
    expect(usePresentationStore.getState().presentation!.slides[0].content).toBe("Nouveau contenu");
  });

  it("updates slide notes on textarea change", () => {
    render(<SlideEditor />);
    const textarea = screen.getByDisplayValue("Note initiale");
    fireEvent.change(textarea, { target: { value: "Nouvelle note" } });
    expect(usePresentationStore.getState().presentation!.slides[0].notes).toBe("Nouvelle note");
  });

  it("shows empty state when no slide is selected", () => {
    usePresentationStore.setState({ presentation: null });
    render(<SlideEditor />);
    expect(screen.getByText("Aucune slide sélectionnée")).toBeInTheDocument();
  });

  it("shows pipe separator hint for two-column layout", () => {
    usePresentationStore.getState().setSlideLayout(0, "two-column");
    render(<SlideEditor />);
    expect(screen.getByText(/Utilisez le caractère/)).toBeInTheDocument();
  });
});
