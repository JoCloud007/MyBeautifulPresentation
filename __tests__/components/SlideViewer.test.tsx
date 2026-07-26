import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlideViewer } from "@/app/components/SlideViewer";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useTemplateStore } from "@/app/stores/templateStore";

describe("SlideViewer", () => {
  beforeEach(() => {
    usePresentationStore.setState({
      presentation: {
        id: "test-pres",
        title: "Test Presentation",
        slides: [
          {
            id: "slide-1",
            title: "First Slide",
            content: "Content 1",
            layout: "title",
          },
          {
            id: "slide-2",
            title: "Second Slide",
            content: "Content 2",
            layout: "title-content",
          },
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

  it("renders slide counter", () => {
    render(<SlideViewer />);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("renders layout label for current slide", () => {
    render(<SlideViewer />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("has disabled previous button on first slide", () => {
    render(<SlideViewer />);
    const prevButton = screen.getAllByRole("button")[0];
    expect(prevButton).toBeDisabled();
  });

  it("has enabled next button when more slides exist", () => {
    render(<SlideViewer />);
    const buttons = screen.getAllByRole("button");
    const nextButton = buttons[buttons.length - 3]; // ChevronRight
    expect(nextButton).not.toBeDisabled();
  });

  it("renders zoom percentage", () => {
    render(<SlideViewer />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows empty state when no presentation", () => {
    usePresentationStore.setState({ presentation: null });
    render(<SlideViewer />);
    expect(screen.getByText("Aucune présentation")).toBeInTheDocument();
  });
});
