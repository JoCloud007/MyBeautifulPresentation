import { describe, it, expect, beforeEach } from "vitest";
import { useTemplateStore, builtInTemplates, getActiveTemplate } from "../templateStore";
import { Template } from "@/app/types/template";

function resetStore() {
  localStorage.clear();
  useTemplateStore.setState({
    activeTemplateId: "corporate",
    customTemplates: [],
  });
}

describe("templateStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("defaults to corporate template", () => {
      const state = useTemplateStore.getState();
      expect(state.activeTemplateId).toBe("corporate");
    });

    it("has no custom templates initially", () => {
      expect(useTemplateStore.getState().customTemplates).toEqual([]);
    });
  });

  describe("setActiveTemplate", () => {
    it("switches to tech template", () => {
      useTemplateStore.getState().setActiveTemplate("tech");
      expect(useTemplateStore.getState().activeTemplateId).toBe("tech");
    });

    it("switches to minimal template", () => {
      useTemplateStore.getState().setActiveTemplate("minimal");
      expect(useTemplateStore.getState().activeTemplateId).toBe("minimal");
    });

    it("switches to startup template", () => {
      useTemplateStore.getState().setActiveTemplate("startup");
      expect(useTemplateStore.getState().activeTemplateId).toBe("startup");
    });

    it("switches to academic template", () => {
      useTemplateStore.getState().setActiveTemplate("academic");
      expect(useTemplateStore.getState().activeTemplateId).toBe("academic");
    });

    it("switches to creative template", () => {
      useTemplateStore.getState().setActiveTemplate("creative");
      expect(useTemplateStore.getState().activeTemplateId).toBe("creative");
    });

    it("switches to dark-luxury template", () => {
      useTemplateStore.getState().setActiveTemplate("dark-luxury");
      expect(useTemplateStore.getState().activeTemplateId).toBe("dark-luxury");
    });

    it("switches back to corporate", () => {
      useTemplateStore.getState().setActiveTemplate("tech");
      useTemplateStore.getState().setActiveTemplate("corporate");
      expect(useTemplateStore.getState().activeTemplateId).toBe("corporate");
    });
  });

  describe("getActiveTemplate", () => {
    it("returns corporate template by default", () => {
      const state = useTemplateStore.getState();
      const active = getActiveTemplate(state);
      expect(active.id).toBe("corporate");
    });

    it("returns tech when active is tech", () => {
      useTemplateStore.getState().setActiveTemplate("tech");
      const state = useTemplateStore.getState();
      const active = getActiveTemplate(state);
      expect(active.id).toBe("tech");
      expect(active.colors.background).toBe("#0f172a");
    });

    it("falls back to corporate for unknown id", () => {
      useTemplateStore.setState({ activeTemplateId: "unknown" as "corporate" });
      const state = useTemplateStore.getState();
      const active = getActiveTemplate(state);
      expect(active.id).toBe("corporate");
    });
  });

  describe("addCustomTemplate", () => {
    it("adds a custom template", () => {
      const custom: Template = {
        id: "custom-1",
        name: "My Custom",
        description: "A custom template",
        category: "creative",
        colors: {
          name: "custom",
          background: "#fff",
          foreground: "#000",
          accent: "#f00",
          secondary: "#888",
          muted: "#eee",
          border: "#ddd",
        },
        fonts: { heading: "Arial", body: "Arial" },
        defaultSlides: [],
      };
      useTemplateStore.getState().addCustomTemplate(custom);
      expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
      expect(useTemplateStore.getState().customTemplates[0].name).toBe("My Custom");
    });

    it("can add multiple custom templates", () => {
      const makeTemplate = (id: string): Template => ({
        id,
        name: id,
        description: "d",
        category: "creative",
        colors: {
          name: "c",
          background: "#fff",
          foreground: "#000",
          accent: "#f00",
          secondary: "#888",
          muted: "#eee",
          border: "#ddd",
        },
        fonts: { heading: "Arial", body: "Arial" },
        defaultSlides: [],
      });
      useTemplateStore.getState().addCustomTemplate(makeTemplate("a"));
      useTemplateStore.getState().addCustomTemplate(makeTemplate("b"));
      expect(useTemplateStore.getState().customTemplates).toHaveLength(2);
    });
  });

  describe("removeCustomTemplate", () => {
    it("removes a custom template by id", () => {
      const custom: Template = {
        id: "to-remove",
        name: "Remove Me",
        description: "d",
        category: "creative",
        colors: {
          name: "c",
          background: "#fff",
          foreground: "#000",
          accent: "#f00",
          secondary: "#888",
          muted: "#eee",
          border: "#ddd",
        },
        fonts: { heading: "Arial", body: "Arial" },
        defaultSlides: [],
      };
      useTemplateStore.getState().addCustomTemplate(custom);
      useTemplateStore.getState().removeCustomTemplate("to-remove");
      expect(useTemplateStore.getState().customTemplates).toHaveLength(0);
    });

    it("does nothing for non-existent id", () => {
      const custom: Template = {
        id: "keep",
        name: "Keep Me",
        description: "d",
        category: "creative",
        colors: {
          name: "c",
          background: "#fff",
          foreground: "#000",
          accent: "#f00",
          secondary: "#888",
          muted: "#eee",
          border: "#ddd",
        },
        fonts: { heading: "Arial", body: "Arial" },
        defaultSlides: [],
      };
      useTemplateStore.getState().addCustomTemplate(custom);
      useTemplateStore.getState().removeCustomTemplate("non-existent");
      expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    });
  });

  describe("builtInTemplates", () => {
    it("contains exactly 10 templates", () => {
      expect(Object.keys(builtInTemplates)).toHaveLength(10);
    });

    it("includes the three premium slide themes", () => {
      const ids = Object.keys(builtInTemplates);
      expect(ids).toContain("editorial");
      expect(ids).toContain("dark-tech");
      expect(ids).toContain("bold");
      expect(builtInTemplates.editorial.slideTheme).toBe("editorial");
      expect(builtInTemplates["dark-tech"].slideTheme).toBe("dark-tech");
      expect(builtInTemplates.bold.slideTheme).toBe("bold");
    });

    it("includes all required template ids", () => {
      const ids = Object.keys(builtInTemplates);
      expect(ids).toContain("corporate");
      expect(ids).toContain("tech");
      expect(ids).toContain("minimal");
      expect(ids).toContain("startup");
      expect(ids).toContain("academic");
      expect(ids).toContain("creative");
      expect(ids).toContain("dark-luxury");
    });

    it("each template has all required color fields", () => {
      for (const t of Object.values(builtInTemplates)) {
        expect(t.colors.background).toBeTruthy();
        expect(t.colors.foreground).toBeTruthy();
        expect(t.colors.accent).toBeTruthy();
        expect(t.colors.secondary).toBeTruthy();
        expect(t.colors.muted).toBeTruthy();
        expect(t.colors.border).toBeTruthy();
      }
    });

    it("each template has heading and body fonts", () => {
      for (const t of Object.values(builtInTemplates)) {
        expect(t.fonts.heading).toBeTruthy();
        expect(t.fonts.body).toBeTruthy();
      }
    });

    it("each template has spacing, borderRadius and shadows", () => {
      for (const t of Object.values(builtInTemplates)) {
        expect(t.spacing).toBeDefined();
        expect(t.borderRadius).toBeDefined();
        expect(t.shadows).toBeDefined();
      }
    });

    it("corporate template has light background", () => {
      expect(builtInTemplates.corporate.colors.background).toBe("#ffffff");
    });

    it("tech template has dark background", () => {
      expect(builtInTemplates.tech.colors.background).toBe("#0f172a");
    });

    it("tech template defines a gradient background", () => {
      expect(builtInTemplates.tech.background?.type).toBe("gradient");
      expect(builtInTemplates.tech.background?.gradient).toBeDefined();
      expect(builtInTemplates.tech.background?.gradient!.stops.length).toBeGreaterThanOrEqual(2);
    });

    it("tech template defines a glow shadow", () => {
      expect(builtInTemplates.tech.shadows?.glow).toBeTruthy();
    });

    it("dark-luxury template defines a gradient background", () => {
      expect(builtInTemplates["dark-luxury"].background?.type).toBe("gradient");
      expect(builtInTemplates["dark-luxury"].background?.gradient).toBeDefined();
    });

    it("dark-luxury template defines a glow shadow", () => {
      expect(builtInTemplates["dark-luxury"].shadows?.glow).toBeTruthy();
    });
  });
});
