import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideThumbnails } from "@/app/components/SlideThumbnails";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useTemplateStore } from "@/app/stores/templateStore";

describe("SlideThumbnails — Docker Compose & UI Polish", () => {
  beforeEach(() => {
    usePresentationStore.setState({
      presentation: {
        id: "pres-1",
        title: "Test",
        slides: [
          { id: "s1", title: "First", content: "C1", layout: "title" },
          { id: "s2", title: "Second", content: "C2", layout: "title-content" },
          { id: "s3", title: "Third", content: "C3", layout: "two-column" },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
    });

    useTemplateStore.setState({
      activeTemplateId: "corporate",
      customTemplates: [],
    });
  });

  it("renders all slide thumbnails", () => {
    render(<SlideThumbnails />);
    // Slide numbers are rendered as badges
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("has an Ajouter une slide button", () => {
    render(<SlideThumbnails />);
    expect(screen.getByText("Ajouter une slide")).toBeInTheDocument();
  });

  it("adds a slide when clicking Ajouter", () => {
    render(<SlideThumbnails />);
    fireEvent.click(screen.getByText("Ajouter une slide"));
    expect(usePresentationStore.getState().presentation!.slides).toHaveLength(4);
  });

  it("changes current slide when clicking a thumbnail", () => {
    render(<SlideThumbnails />);
    const buttons = screen.getAllByRole("button");
    // Click the second thumbnail button (first is usually the slide preview)
    const thumbButtons = buttons.filter((b) => b.className.includes("aspect-video"));
    fireEvent.click(thumbButtons[1]);
    expect(usePresentationStore.getState().currentSlideIndex).toBe(1);
  });

  it("duplicates a slide when clicking duplicate icon", () => {
    render(<SlideThumbnails />);
    const duplicateButtons = screen.getAllByTitle("Dupliquer");
    fireEvent.click(duplicateButtons[0]);
    expect(usePresentationStore.getState().presentation!.slides).toHaveLength(4);
    expect(usePresentationStore.getState().presentation!.slides[1].title).toBe("First");
  });

  it("removes a slide when clicking delete icon", () => {
    render(<SlideThumbnails />);
    const deleteButtons = screen.getAllByTitle("Supprimer");
    fireEvent.click(deleteButtons[1]);
    expect(usePresentationStore.getState().presentation!.slides).toHaveLength(2);
  });

  it("shows empty state with Ajouter button when no slides", () => {
    usePresentationStore.setState({
      presentation: {
        id: "pres-1",
        title: "Test",
        slides: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
    });
    render(<SlideThumbnails />);
    expect(screen.getByText("Aucune slide")).toBeInTheDocument();
    expect(screen.getByText("Ajouter")).toBeInTheDocument();
  });

  it("shows layout name for each slide", () => {
    render(<SlideThumbnails />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("title content")).toBeInTheDocument();
  });
});
