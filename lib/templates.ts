import { Template, TemplateId } from "@/app/types/template";
import { builtInTemplates } from "@/app/stores/templateStore";

export function getTemplateById(id: TemplateId | string): Template | undefined {
  return builtInTemplates[id as TemplateId];
}

export function getAllTemplates(): Template[] {
  return Object.values(builtInTemplates);
}

export function applyTemplateColors(
  templateId: TemplateId
): Record<string, string> {
  const template = getTemplateById(templateId);
  if (!template) return {};

  const vars: Record<string, string> = {
    "--template-bg": template.colors.background,
    "--template-fg": template.colors.foreground,
    "--template-accent": template.colors.accent,
    "--template-secondary": template.colors.secondary,
    "--template-muted": template.colors.muted,
    "--template-border": template.colors.border,
    "--template-heading-font": template.fonts.heading,
    "--template-body-font": template.fonts.body,
  };

  if (template.spacing) {
    vars["--template-spacing-xs"] = `${template.spacing.xs}px`;
    vars["--template-spacing-sm"] = `${template.spacing.sm}px`;
    vars["--template-spacing-md"] = `${template.spacing.md}px`;
    vars["--template-spacing-lg"] = `${template.spacing.lg}px`;
    vars["--template-spacing-xl"] = `${template.spacing.xl}px`;
  }

  if (template.borderRadius) {
    vars["--template-radius-sm"] = `${template.borderRadius.sm}px`;
    vars["--template-radius-md"] = `${template.borderRadius.md}px`;
    vars["--template-radius-lg"] = `${template.borderRadius.lg}px`;
    vars["--template-radius-xl"] = `${template.borderRadius.xl}px`;
  }

  if (template.shadows) {
    vars["--template-shadow-sm"] = template.shadows.sm;
    vars["--template-shadow-md"] = template.shadows.md;
    vars["--template-shadow-lg"] = template.shadows.lg;
    if (template.shadows.glow) {
      vars["--template-shadow-glow"] = template.shadows.glow;
    }
  }

  if (template.background?.type === "gradient" && template.background.gradient) {
    const grad = template.background.gradient;
    const stops = grad.stops.map((s) => `${s.color} ${s.position}%`).join(", ");
    vars["--template-bg-gradient"] = `linear-gradient(${grad.direction}, ${stops})`;
  }

  return vars;
}
