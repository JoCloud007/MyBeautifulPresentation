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

  return {
    "--template-bg": template.colors.background,
    "--template-fg": template.colors.foreground,
    "--template-accent": template.colors.accent,
    "--template-secondary": template.colors.secondary,
    "--template-muted": template.colors.muted,
    "--template-border": template.colors.border,
    "--template-heading-font": template.fonts.heading,
    "--template-body-font": template.fonts.body,
  };
}
