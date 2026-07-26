"use client";

import {
  useTemplateStore,
  builtInTemplates,
  getActiveTemplate,
} from "../stores/templateStore";
import { cn } from "@/lib/utils";

export function TemplateSelector() {
  const state = useTemplateStore();
  const active = getActiveTemplate(state);
  const allTemplates = [
    ...Object.values(builtInTemplates),
    ...state.customTemplates,
  ];

  return (
    <div className="flex flex-col gap-2 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Templates
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {allTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => state.setActiveTemplate(template.id)}
            className={cn(
              "flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all hover:shadow-sm",
              active.id === template.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:bg-accent"
            )}
          >
            {/* Color preview */}
            <div
              className="w-8 h-8 rounded-md border flex-shrink-0 shadow-sm"
              style={{
                backgroundColor: template.colors.background,
                borderColor: template.colors.border,
              }}
            >
              <div
                className="w-full h-1.5 rounded-t-md"
                style={{ backgroundColor: template.colors.accent }}
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{template.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {template.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
