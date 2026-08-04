"use client";

import { useState, useCallback, useRef } from "react";
import { useTemplateStore, getActiveTemplate, builtInTemplates } from "../stores/templateStore";
import { usePresentationStore } from "../stores/presentationStore";
import { Template, TemplateColor, TemplateBackground, TemplateHeader, TemplateFooter } from "../types/template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Type,
  Palette,
  Image,
  FileText,
  Save,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const FONT_OPTIONS = [
  { value: "Geist, system-ui, sans-serif", label: "Geist (Sans-serif)" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (Serif)" },
  { value: "'Courier New', Courier, monospace", label: "Courier (Monospace)" },
  { value: "'Segoe UI', Tahoma, sans-serif", label: "Segoe UI" },
  { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica" },
  { value: "'Roboto', sans-serif", label: "Roboto" },
  { value: "'Inter', sans-serif", label: "Inter" },
  { value: "'Playfair Display', serif", label: "Playfair Display" },
];

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-border p-0.5"
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs font-mono"
        />
      </div>
    </div>
  );
}

export function TemplateEditor() {
  const store = useTemplateStore();
  const activeTemplate = getActiveTemplate(store);
  const isBuiltIn = activeTemplate.id in builtInTemplates;

  const [workingTemplate, setWorkingTemplate] = useState<Template>(activeTemplate);
  const [saved, setSaved] = useState(false);
  const [previewLayout, setPreviewLayout] = useState("title-content");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (updates: Partial<Template>) => {
      setWorkingTemplate((prev) => ({ ...prev, ...updates }));
      setSaved(false);
    },
    []
  );

  const updateColors = useCallback(
    (colors: Partial<TemplateColor>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        colors: { ...prev.colors, ...colors },
      }));
      setSaved(false);
    },
    []
  );

  const updateBackground = useCallback(
    (bg: Partial<TemplateBackground>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        background: { ...(prev.background || { type: "color" }), ...bg },
      }));
      setSaved(false);
    },
    []
  );

  const updateHeader = useCallback(
    (h: Partial<TemplateHeader>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        header: { ...(prev.header || { text: "", enabled: false, showDate: false }), ...h },
      }));
      setSaved(false);
    },
    []
  );

  const updateFooter = useCallback(
    (f: Partial<TemplateFooter>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        footer: { ...(prev.footer || { text: "", enabled: false, showPageNumber: false, showDate: false }), ...f },
      }));
      setSaved(false);
    },
    []
  );

  const handleSave = useCallback(() => {
    if (isBuiltIn) {
      const newId = store.cloneTemplate(activeTemplate.id, workingTemplate.name);
      if (newId) {
        store.updateTemplate(newId, workingTemplate);
      }
    } else {
      store.updateTemplate(workingTemplate.id, workingTemplate);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [isBuiltIn, activeTemplate.id, workingTemplate, store]);

  const handleReset = useCallback(() => {
    setWorkingTemplate(activeTemplate);
    setSaved(false);
  }, [activeTemplate]);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        updateBackground({ type: "image", imageUrl: ev.target?.result as string, opacity: workingTemplate.background?.opacity || 100 });
      };
      reader.readAsDataURL(file);
    },
    [updateBackground, workingTemplate.background?.opacity]
  );

  const presentation = usePresentationStore((s) => s.presentation);
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex);
  const currentSlide = presentation?.slides[currentSlideIndex];

  const previewSlide = currentSlide || {
    id: "preview",
    layout: previewLayout as any,
    title: "Bienvenue",
    content: "Ceci est un aperçu en temps réel de votre template. Modifiez les couleurs, les polices et l'arrière-plan dans le panneau de gauche.",
    notes: "",
  };

  const bg = workingTemplate.background || { type: "color" as const, color: workingTemplate.colors.background, opacity: 100 };
  const header = workingTemplate.header || { text: "", enabled: false, showDate: false };
  const footer = workingTemplate.footer || { text: "", enabled: false, showPageNumber: false, showDate: false };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Éditeur de Template</span>
          {isBuiltIn && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Template intégré — sauvegarde en copie
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[11px] text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Sauvegardé
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleReset}>
            <RotateCcw className="h-3 w-3" />
            Réinitialiser
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave}>
            {isBuiltIn ? <Copy className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {isBuiltIn ? "Dupliquer & Sauver" : "Sauvegarder"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[300px] border-r overflow-y-auto p-3 space-y-3 shrink-0">
          {/* Name */}
          <div className="border border-border rounded-lg p-3 bg-card">
            <Label className="text-[11px] text-muted-foreground">Nom du template</Label>
            <Input
              value={workingTemplate.name}
              onChange={(e) => update({ name: e.target.value })}
              className="h-8 text-sm mt-1"
            />
          </div>

          {/* Typography */}
          <Section title="Typographie" icon={<Type className="h-3.5 w-3.5" />}>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Police titres</label>
              <select
                value={workingTemplate.fonts.heading}
                onChange={(e) =>
                  update({ fonts: { ...workingTemplate.fonts, heading: e.target.value } })
                }
                className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Police corps</label>
              <select
                value={workingTemplate.fonts.body}
                onChange={(e) =>
                  update({ fonts: { ...workingTemplate.fonts, body: e.target.value } })
                }
                className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">Taille titre (px)</label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {workingTemplate.fontSizes?.heading || 48}
                </span>
              </div>
              <Slider
                min={24}
                max={96}
                step={2}
                value={[workingTemplate.fontSizes?.heading || 48]}
                onValueChange={(v) =>
                  update({ fontSizes: { ...workingTemplate.fontSizes, heading: (v as number[])[0] } })
                }
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">Taille corps (px)</label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {workingTemplate.fontSizes?.body || 18}
                </span>
              </div>
              <Slider
                min={12}
                max={32}
                step={1}
                value={[workingTemplate.fontSizes?.body || 18]}
                onValueChange={(v) =>
                  update({ fontSizes: { ...workingTemplate.fontSizes, body: (v as number[])[0] } })
                }
              />
            </div>
          </Section>

          {/* Colors */}
          <Section title="Couleurs" icon={<Palette className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-2 gap-3">
              <ColorInput label="Fond" value={workingTemplate.colors.background} onChange={(v) => updateColors({ background: v })} />
              <ColorInput label="Texte" value={workingTemplate.colors.foreground} onChange={(v) => updateColors({ foreground: v })} />
              <ColorInput label="Accent" value={workingTemplate.colors.accent} onChange={(v) => updateColors({ accent: v })} />
              <ColorInput label="Secondaire" value={workingTemplate.colors.secondary} onChange={(v) => updateColors({ secondary: v })} />
              <ColorInput label="Muted" value={workingTemplate.colors.muted} onChange={(v) => updateColors({ muted: v })} />
              <ColorInput label="Bordure" value={workingTemplate.colors.border} onChange={(v) => updateColors({ border: v })} />
            </div>
          </Section>

          {/* Background */}
          <Section title="Arrière-plan" icon={<Image className="h-3.5 w-3.5" />}>
            <div className="flex gap-2">
              <button
                onClick={() => updateBackground({ type: "color" })}
                className={cn(
                  "flex-1 py-1.5 text-[11px] rounded-md border transition-colors",
                  bg.type === "color"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                Couleur
              </button>
              <button
                onClick={() => updateBackground({ type: "image" })}
                className={cn(
                  "flex-1 py-1.5 text-[11px] rounded-md border transition-colors",
                  bg.type === "image"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                Image
              </button>
            </div>
            {bg.type === "image" && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {bg.imageUrl ? (
                    <img src={bg.imageUrl} alt="Background" className="max-h-24 mx-auto rounded" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Cliquer pour uploader une image</span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">Opacité image (%)</label>
                <span className="text-[11px] text-muted-foreground tabular-nums">{bg.opacity || 100}</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[bg.opacity || 100]}
                onValueChange={(v) => updateBackground({ opacity: (v as number[])[0] })}
              />
            </div>
          </Section>

          {/* Header / Footer */}
          <Section title="En-tête / Pied" icon={<FileText className="h-3.5 w-3.5" />}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="header-enabled"
                  checked={header.enabled}
                  onChange={(e) => updateHeader({ enabled: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <Label htmlFor="header-enabled" className="text-xs cursor-pointer">
                  Afficher l'en-tête
                </Label>
              </div>
              {header.enabled && (
                <>
                  <Input
                    value={header.text}
                    onChange={(e) => updateHeader({ text: e.target.value })}
                    placeholder="Texte d'en-tête"
                    className="h-7 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="header-date"
                      checked={header.showDate}
                      onChange={(e) => updateHeader({ showDate: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    <Label htmlFor="header-date" className="text-[11px] cursor-pointer">
                      Date
                    </Label>
                  </div>
                </>
              )}

              <div className="border-t border-border pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="footer-enabled"
                    checked={footer.enabled}
                    onChange={(e) => updateFooter({ enabled: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  <Label htmlFor="footer-enabled" className="text-xs cursor-pointer">
                    Afficher le pied de page
                  </Label>
                </div>
              </div>
              {footer.enabled && (
                <>
                  <Input
                    value={footer.text}
                    onChange={(e) => updateFooter({ text: e.target.value })}
                    placeholder="Texte du pied de page"
                    className="h-7 text-xs"
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="footer-page"
                        checked={footer.showPageNumber}
                        onChange={(e) => updateFooter({ showPageNumber: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      <Label htmlFor="footer-page" className="text-[11px] cursor-pointer">
                        Numéro
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="footer-date"
                        checked={footer.showDate}
                        onChange={(e) => updateFooter({ showDate: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      <Label htmlFor="footer-date" className="text-[11px] cursor-pointer">
                        Date
                      </Label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>
        </div>

        {/* Center Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Layout selector */}
          <div className="flex items-center justify-center gap-2 px-4 py-2 border-b bg-background/95 shrink-0">
            {["title", "title-content", "two-column", "title-only", "content-only"].map((layout) => (
              <button
                key={layout}
                onClick={() => setPreviewLayout(layout)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md border transition-colors capitalize",
                  previewLayout === layout
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {layout.replace(/-/g, " ")}
              </button>
            ))}
          </div>

          {/* Slide preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-muted/20 overflow-auto">
            <div
              className="relative rounded-xl shadow-2xl overflow-hidden border"
              style={{
                width: "640px",
                height: "360px",
                backgroundColor: bg.type === "color" ? bg.color : workingTemplate.colors.background,
                borderColor: workingTemplate.colors.border,
              }}
            >
              {bg.type === "image" && bg.imageUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${bg.imageUrl})`,
                    opacity: (bg.opacity || 100) / 100,
                  }}
                />
              )}
              {/* Header */}
              {header.enabled && (
                <div
                  className="absolute top-0 left-0 right-0 h-7 flex items-center justify-between px-5 text-[10px] z-10"
                  style={{
                    color: workingTemplate.colors.secondary,
                    borderBottom: `1px solid ${workingTemplate.colors.border}`,
                    backgroundColor: workingTemplate.colors.background,
                  }}
                >
                  <span style={{ fontFamily: workingTemplate.fonts.body }}>{header.text}</span>
                  {header.showDate && (
                    <span style={{ fontFamily: workingTemplate.fonts.body }}>
                      {new Date().toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              )}
              {/* Content */}
              <div
                className="relative z-10 h-full flex flex-col"
                style={{
                  paddingTop: header.enabled ? "28px" : "0",
                  paddingBottom: footer.enabled ? "24px" : "0",
                }}
              >
                <div className="flex-1 flex flex-col justify-center px-10 py-6">
                  {previewLayout !== "content-only" && (
                    <h2
                      className="font-bold mb-3"
                      style={{
                        fontFamily: workingTemplate.fonts.heading,
                        color: workingTemplate.colors.foreground,
                        fontSize: `${workingTemplate.fontSizes?.heading || 48}px`,
                        lineHeight: 1.2,
                      }}
                    >
                      {previewSlide.title}
                    </h2>
                  )}
                  {previewLayout !== "title-only" && (
                    <div
                      className="leading-relaxed"
                      style={{
                        fontFamily: workingTemplate.fonts.body,
                        color: workingTemplate.colors.secondary,
                        fontSize: `${workingTemplate.fontSizes?.body || 18}px`,
                      }}
                    >
                      {previewSlide.content}
                    </div>
                  )}
                </div>
              </div>
              {/* Footer */}
              {footer.enabled && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-6 flex items-center justify-center text-[10px] z-10"
                  style={{
                    color: workingTemplate.colors.secondary,
                    borderTop: `1px solid ${workingTemplate.colors.border}`,
                    backgroundColor: workingTemplate.colors.background,
                  }}
                >
                  <span style={{ fontFamily: workingTemplate.fonts.body }}>
                    {footer.text}
                    {footer.showPageNumber && " · 1 / 12"}
                    {footer.showDate && ` · ${new Date().toLocaleDateString("fr-FR")}`}
                  </span>
                </div>
              )}
              {/* Accent bar */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 z-20"
                style={{ backgroundColor: workingTemplate.colors.accent }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
