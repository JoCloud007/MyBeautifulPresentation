import { describe, it, expect } from "vitest";
import { getTemplateById, getAllTemplates, applyTemplateColors } from "../templates";
import { TemplateId } from "@/app/types/template";

describe("lib/templates", () => {
  describe("getTemplateById", () => {
    it("returns the corporate template", () => {
      const t = getTemplateById("corporate");
      expect(t).toBeDefined();
      expect(t!.id).toBe("corporate");
      expect(t!.name).toBe("Corporate");
      expect(t!.category).toBe("corporate");
    });

    it("returns the tech template", () => {
      const t = getTemplateById("tech");
      expect(t).toBeDefined();
      expect(t!.id).toBe("tech");
      expect(t!.colors.background).toBe("#0f172a");
    });

    it("returns the minimal template", () => {
      const t = getTemplateById("minimal");
      expect(t).toBeDefined();
      expect(t!.id).toBe("minimal");
    });

    it("returns undefined for unknown id", () => {
      const t = getTemplateById("unknown" as TemplateId);
      expect(t).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      const t = getTemplateById("" as TemplateId);
      expect(t).toBeUndefined();
    });
  });

  describe("getAllTemplates", () => {
    it("returns exactly 3 built-in templates", () => {
      const all = getAllTemplates();
      expect(all).toHaveLength(3);
      const ids = all.map((t) => t.id).sort();
      expect(ids).toEqual(["corporate", "minimal", "tech"]);
    });

    it("each template has required fields", () => {
      for (const t of getAllTemplates()) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.colors).toBeDefined();
        expect(t.fonts).toBeDefined();
        expect(t.defaultSlides).toBeInstanceOf(Array);
      }
    });
  });

  describe("applyTemplateColors", () => {
    it("returns CSS variables for corporate template", () => {
      const vars = applyTemplateColors("corporate");
      expect(vars["--template-bg"]).toBe("#ffffff");
      expect(vars["--template-fg"]).toBe("#1a1a2e");
      expect(vars["--template-accent"]).toBe("#1e40af");
      expect(vars["--template-heading-font"]).toContain("Geist");
    });

    it("returns CSS variables for tech template", () => {
      const vars = applyTemplateColors("tech");
      expect(vars["--template-bg"]).toBe("#0f172a");
      expect(vars["--template-accent"]).toBe("#06b6d4");
    });

    it("returns empty object for unknown template", () => {
      const vars = applyTemplateColors("unknown" as TemplateId);
      expect(vars).toEqual({});
    });

    it("includes all expected CSS variable keys", () => {
      const vars = applyTemplateColors("minimal");
      const expectedKeys = [
        "--template-bg",
        "--template-fg",
        "--template-accent",
        "--template-secondary",
        "--template-muted",
        "--template-border",
        "--template-heading-font",
        "--template-body-font",
      ];
      for (const key of expectedKeys) {
        expect(vars).toHaveProperty(key);
      }
    });
  });
});
