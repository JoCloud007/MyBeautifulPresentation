import { describe, it, expect, beforeEach } from "vitest";
import { useTemplateStore, builtInTemplates, getActiveTemplate } from "@/app/stores/templateStore";

describe("templateStore", () => {
  beforeEach(() => {
    useTemplateStore.setState({
      activeTemplateId: "corporate",
      customTemplates: [],
    });
  });

  describe("Initial State", () => {
    it("should default to corporate template", () => {
      const state = useTemplateStore.getState();
      expect(state.activeTemplateId).toBe("corporate");
      expect(state.customTemplates).toEqual([]);
    });
  });

  describe("builtInTemplates", () => {
    it("should have exactly 3 templates", () => {
      expect(Object.keys(builtInTemplates)).toHaveLength(3);
    });

    it("should have corporate, tech, and minimal templates", () => {
      expect(builtInTemplates.corporate).toBeDefined();
      expect(builtInTemplates.tech).toBeDefined();
      expect(builtInTemplates.minimal).toBeDefined();
    });

    it("should have valid corporate template structure", () => {
      const corp = builtInTemplates.corporate;
      expect(corp.id).toBe("corporate");
      expect(corp.name).toBe("Corporate");
      expect(corp.category).toBe("corporate");
      expect(corp.colors.background).toBe("#ffffff");
      expect(corp.colors.accent).toBe("#1e40af");
      expect(corp.fonts.heading).toBeDefined();
      expect(corp.defaultSlides).toBeInstanceOf(Array);
    });

    it("should have valid tech template with dark theme", () => {
      const tech = builtInTemplates.tech;
      expect(tech.id).toBe("tech");
      expect(tech.colors.background).toBe("#0f172a");
      expect(tech.colors.foreground).toBe("#f8fafc");
      expect(tech.colors.accent).toBe("#06b6d4");
    });

    it("should have valid minimal template", () => {
      const min = builtInTemplates.minimal;
      expect(min.id).toBe("minimal");
      expect(min.colors.background).toBe("#fafafa");
      expect(min.colors.accent).toBe("#171717");
    });

    it("should have all required color properties", () => {
      Object.values(builtInTemplates).forEach((template) => {
        expect(template.colors.name).toBeDefined();
        expect(template.colors.background).toBeDefined();
        expect(template.colors.foreground).toBeDefined();
        expect(template.colors.accent).toBeDefined();
        expect(template.colors.secondary).toBeDefined();
        expect(template.colors.muted).toBeDefined();
        expect(template.colors.border).toBeDefined();
      });
    });

    it("should have all required font properties", () => {
      Object.values(builtInTemplates).forEach((template) => {
        expect(template.fonts.heading).toBeDefined();
        expect(template.fonts.body).toBeDefined();
      });
    });
  });

  describe("setActiveTemplate", () => {
    it("should switch to tech template", () => {
      const { setActiveTemplate } = useTemplateStore.getState();
      setActiveTemplate("tech");
      expect(useTemplateStore.getState().activeTemplateId).toBe("tech");
    });

    it("should switch to minimal template", () => {
      const { setActiveTemplate } = useTemplateStore.getState();
      setActiveTemplate("minimal");
      expect(useTemplateStore.getState().activeTemplateId).toBe("minimal");
    });

    it("should switch back to corporate", () => {
      const { setActiveTemplate } = useTemplateStore.getState();
      setActiveTemplate("tech");
      setActiveTemplate("corporate");
      expect(useTemplateStore.getState().activeTemplateId).toBe("corporate");
    });
  });

  describe("getActiveTemplate", () => {
    it("should return corporate when active", () => {
      const state = useTemplateStore.getState();
      const active = getActiveTemplate(state);
      expect(active.id).toBe("corporate");
    });

    it("should return tech when active", () => {
      useTemplateStore.getState().setActiveTemplate("tech");
      const state = useTemplateStore.getState();
      const active = getActiveTemplate(state);
      expect(active.id).toBe("tech");
    });

    it("should fallback to corporate for invalid id", () => {
      useTemplateStore.setState({ activeTemplateId: "invalid" as "corporate" });
      const state = useTemplateStore.getState();
      const active = getActiveTemplate(state);
      expect(active.id).toBe("corporate");
    });
  });

  describe("addCustomTemplate", () => {
    it("should add a custom template", () => {
      const customTemplate = {
        id: "custom-1",
        name: "Custom",
        description: "A custom template",
        category: "creative" as const,
        colors: {
          name: "custom",
          background: "#000000",
          foreground: "#ffffff",
          accent: "#ff0000",
          secondary: "#888888",
          muted: "#333333",
          border: "#444444",
        },
        fonts: {
          heading: "Arial",
          body: "Arial",
        },
        defaultSlides: [{ layout: "title" as const }],
      };

      const { addCustomTemplate } = useTemplateStore.getState();
      addCustomTemplate(customTemplate);
      expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
      expect(useTemplateStore.getState().customTemplates[0].name).toBe("Custom");
    });
  });

  describe("removeCustomTemplate", () => {
    it("should remove a custom template by id", () => {
      const customTemplate = {
        id: "custom-1",
        name: "Custom",
        description: "A custom template",
        category: "creative" as const,
        colors: {
          name: "custom",
          background: "#000000",
          foreground: "#ffffff",
          accent: "#ff0000",
          secondary: "#888888",
          muted: "#333333",
          border: "#444444",
        },
        fonts: {
          heading: "Arial",
          body: "Arial",
        },
        defaultSlides: [{ layout: "title" as const }],
      };

      const { addCustomTemplate, removeCustomTemplate } = useTemplateStore.getState();
      addCustomTemplate(customTemplate);
      removeCustomTemplate("custom-1");
      expect(useTemplateStore.getState().customTemplates).toHaveLength(0);
    });

    it("should not fail when removing non-existent template", () => {
      const { removeCustomTemplate } = useTemplateStore.getState();
      removeCustomTemplate("non-existent");
      expect(useTemplateStore.getState().customTemplates).toHaveLength(0);
    });
  });
});
