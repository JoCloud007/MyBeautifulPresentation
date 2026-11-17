import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useTemplateStore } from "@/app/stores/templateStore";

// Dépendances réseau / lourdes neutralisées : ce test ne couvre QUE la galerie
// des thèmes intégrés (le composant lui-même reste rendu pour de vrai).
vi.mock("@/app/hooks/useTemplates", () => ({
  useTemplates: () => ({
    templates: [],
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    createTemplate: vi.fn(),
  }),
}));

vi.mock("@/app/components/layout/StoryPanel", () => ({
  StoryPanel: () => <div data-testid="story-panel" />,
}));

vi.mock("@/app/components/brand/BrandImportWizard", () => ({
  BrandImportWizard: () => <div data-testid="brand-wizard" />,
}));

import { TemplateView } from "@/app/components/template/TemplateView";

describe("TemplateView — galerie des thèmes intégrés", () => {
  beforeEach(() => {
    useTemplateStore.setState({
      activeTemplateId: "corporate",
      customTemplates: [],
    });
  });

  it("affiche les trois thèmes premium avec leur aperçu", () => {
    const { container } = render(<TemplateView onClose={() => {}} />);
    expect(screen.getByText("Editorial")).toBeInTheDocument();
    expect(screen.getByText("Dark Tech")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    // Un aperçu rendu (MiniSlideRenderer) par thème de la galerie.
    expect(container.querySelectorAll("[data-layout]").length).toBeGreaterThanOrEqual(10);
  });

  it("marque le thème actif", () => {
    useTemplateStore.setState({ activeTemplateId: "bold" });
    render(<TemplateView onClose={() => {}} />);
    expect(screen.getByText("Actif")).toBeInTheDocument();
  });

  it("applique le thème au clic", () => {
    render(<TemplateView onClose={() => {}} />);
    const card = screen.getByText("Dark Tech").closest("button");
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(useTemplateStore.getState().activeTemplateId).toBe("dark-tech");
  });
});
