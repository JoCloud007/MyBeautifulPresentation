import { describe, it, expect } from "vitest";
import { getTemplateById, getAllTemplates, applyTemplateColors } from "@/lib/templates";

describe("Template Library Functions", () => {
  describe("getTemplateById", () => {
    it("should return corporate template", () => {
      const template = getTemplateById("corporate");
      expect(template).toBeDefined();
      expect(template!.id).toBe("corporate");
    });

    it("should return tech template", () => {
      const template = getTemplateById("tech");
      expect(template).toBeDefined();
      expect(template!.id).toBe("tech");
    });

    it("should return minimal template", () => {
      const template = getTemplateById("minimal");
      expect(template).toBeDefined();
      expect(template!.id).toBe("minimal");
    });

    it("should return undefined for unknown id", () => {
      const template = getTemplateById("unknown");
      expect(template).toBeUndefined();
    });

    it("should have valid color scheme for each template", () => {
      const corporate = getTemplateById("corporate");
      expect(corporate!.colors.background).toBe("#ffffff");
      expect(corporate!.colors.accent).toBe("#1e40af");

      const tech = getTemplateById("tech");
      expect(tech!.colors.background).toBe("#0f172a");
      expect(tech!.colors.accent).toBe("#06b6d4");

      const minimal = getTemplateById("minimal");
      expect(minimal!.colors.background).toBe("#fafafa");
      expect(minimal!.colors.accent).toBe("#171717");
    });
  });

  describe("getAllTemplates", () => {
    it("should return all 3 templates", () => {
      const templates = getAllTemplates();
      expect(templates).toHaveLength(3);
    });

    it("should include all template ids", () => {
      const templates = getAllTemplates();
      const ids = templates.map((t) => t.id);
      expect(ids).toContain("corporate");
      expect(ids).toContain("tech");
      expect(ids).toContain("minimal");
    });

    it("should return templates with complete data", () => {
      const templates = getAllTemplates();
      templates.forEach((template) => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.category).toBeDefined();
        expect(template.colors).toBeDefined();
        expect(template.fonts).toBeDefined();
        expect(template.defaultSlides).toBeDefined();
      });
    });
  });

  describe("applyTemplateColors", () => {
    it("should return CSS variables for corporate", () => {
      const colors = applyTemplateColors("corporate");
      expect(colors["--template-bg"]).toBe("#ffffff");
      expect(colors["--template-fg"]).toBe("#1a1a2e");
      expect(colors["--template-accent"]).toBe("#1e40af");
      expect(colors["--template-secondary"]).toBe("#64748b");
      expect(colors["--template-muted"]).toBe("#f1f5f9");
      expect(colors["--template-border"]).toBe("#e2e8f0");
    });

    it("should return CSS variables for tech", () => {
      const colors = applyTemplateColors("tech");
      expect(colors["--template-bg"]).toBe("#0f172a");
      expect(colors["--template-fg"]).toBe("#f8fafc");
      expect(colors["--template-accent"]).toBe("#06b6d4");
    });

    it("should return CSS variables for minimal", () => {
      const colors = applyTemplateColors("minimal");
      expect(colors["--template-bg"]).toBe("#fafafa");
      expect(colors["--template-fg"]).toBe("#171717");
      expect(colors["--template-accent"]).toBe("#171717");
    });

    it("should include font variables", () => {
      const colors = applyTemplateColors("corporate");
      expect(colors["--template-heading-font"]).toBeDefined();
      expect(colors["--template-body-font"]).toBeDefined();
    });

    it("should return empty object for invalid template id", () => {
      const colors = applyTemplateColors("invalid" as "corporate");
      expect(colors).toEqual({});
    });

    it("should return 8 CSS variables for valid template", () => {
      const colors = applyTemplateColors("corporate");
      expect(Object.keys(colors)).toHaveLength(8);
    });
  });
});
