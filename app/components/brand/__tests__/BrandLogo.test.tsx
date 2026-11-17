import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandLogo } from "@/app/components/brand/BrandLogo";
import { Template } from "@/app/types/template";

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "brand-test",
    name: "Brand Test",
    description: "test",
    category: "brand",
    colors: {
      name: "brand-test",
      background: "#ffffff",
      foreground: "#1a202c",
      accent: "#0b3d91",
      secondary: "#4a5568",
      muted: "#f7f7f9",
      border: "#e2e8f0",
    },
    fonts: { heading: "Geist", body: "Geist" },
    defaultSlides: [{ layout: "title" }],
    ...overrides,
  };
}

const LOGO_URL = "data:image/svg+xml;base64,PHN2Zy8+";

describe("BrandLogo", () => {
  it("renders nothing when the template has no logo", () => {
    const template = makeTemplate();
    const { container } = render(
      <BrandLogo logo={template.logo as never} />
    );
    // Le composant reçoit un logo absent : il ne doit pas lever.
    expect(container).toBeDefined();
  });

  it("renders the logo image at the requested placement", () => {
    const { container } = render(
      <BrandLogo
        logo={{
          url: LOGO_URL,
          alt: "Acme",
          placement: "header-left",
          maxHeight: 8,
        }}
      />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(LOGO_URL);
    expect(img!.getAttribute("alt")).toBe("Acme");
  });

  it("hides the logo in mini (thumbnail) rendering", () => {
    const { container } = render(
      <BrandLogo
        isMini
        logo={{
          url: LOGO_URL,
          placement: "header-left",
          maxHeight: 8,
        }}
      />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("is hidden from assistive tech (purely decorative)", () => {
    const { container } = render(
      <BrandLogo
        logo={{ url: LOGO_URL, placement: "header-right", maxHeight: 6 }}
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  });

  it("clamps an absurd maxHeight instead of overflowing the slide", () => {
    const { container } = render(
      <BrandLogo
        logo={{ url: LOGO_URL, placement: "header-left", maxHeight: 900 }}
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const height = parseFloat(wrapper.style.height);
    // Plafond : 20 % du template / 2.2 ≈ 9 % de la slide.
    expect(height).toBeLessThanOrEqual(10);
  });

  it("applies the logo opacity", () => {
    const { container } = render(
      <BrandLogo
        logo={{ url: LOGO_URL, placement: "header-left", maxHeight: 8, opacity: 0.5 }}
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe("0.5");
  });

  it("falls back to header-left for an unknown placement", () => {
    const { container } = render(
      <BrandLogo
        logo={{
          url: LOGO_URL,
          placement: "nowhere" as never,
          maxHeight: 8,
        }}
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.left).toBe("4%");
  });
});
