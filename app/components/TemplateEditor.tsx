"use client";

import { useState, useCallback, useRef } from "react";
import { useTemplateStore, getActiveTemplate, builtInTemplates } from "../stores/templateStore";
import { usePresentationStore } from "../stores/presentationStore";
import {
  Template,
  TemplateColor,
  TemplateBackground,
  TemplateHeader,
  TemplateFooter,
  TemplateSpacing,
  TemplateBorderRadius,
  TemplateShadow,

} from "../types/template";
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
  BoxSelect,
  Square,
  Sparkles,
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
    <div className="border border-white/10 rounded-lg overflow-hidden bg-[#16162a]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-white/40 hover:bg-accent/50 transition-colors"
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
      <label className="text-[11px] text-white/40 block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-white/10 p-0.5"
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

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "px",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-white/40">{label}</label>
        <span className="text-[11px] text-white/40 tabular-nums">
          {value}{suffix}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange((v as number[])[0])}
      />
    </div>
  );
}

function ShadowInput({
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
      <label className="text-[11px] text-white/40 block mb-1">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs font-mono"
        placeholder="0 4px 6px rgba(0,0,0,0.1)"
      />
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

  const updateSpacing = useCallback(
    (s: Partial<TemplateSpacing>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        spacing: { ...(prev.spacing || { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 }), ...s },
      }));
      setSaved(false);
    },
    []
  );

  const updateBorderRadius = useCallback(
    (r: Partial<TemplateBorderRadius>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        borderRadius: { ...(prev.borderRadius || { sm: 4, md: 8, lg: 12, xl: 16 }), ...r },
      }));
      setSaved(false);
    },
    []
  );

  const updateShadows = useCallback(
    (sh: Partial<TemplateShadow>) => {
      setWorkingTemplate((prev) => ({
        ...prev,
        shadows: { ...(prev.shadows || { sm: "", md: "", lg: "" }), ...sh },
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
    content: "Ceci est un aperçu en temps réel de votre template. Modifiez les couleurs, les polices, l'arrière-plan, les espacements et les ombres dans le panneau de gauche.",
    notes: "",
  };

  const bg = workingTemplate.background || { type: "color" as const, color: workingTemplate.colors.background, opacity: 100 };
  const header = workingTemplate.header || { text: "", enabled: false, showDate: false };
  const footer = workingTemplate.footer || { text: "", enabled: false, showPageNumber: false, showDate: false };
  const spacing = workingTemplate.spacing || { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
  const radius = workingTemplate.borderRadius || { sm: 4, md: 8, lg: 12, xl: 16 };
  const shadows = workingTemplate.shadows || { sm: "0 1px 2px rgba(0,0,0,0.05)", md: "0 4px 6px rgba(0,0,0,0.07)", lg: "0 10px 15px rgba(0,0,0,0.1)" };

  const bgStyle: React.CSSProperties =
    bg.type === "gradient" && bg.gradient
      ? {
          background: `linear-gradient(${bg.gradient.direction}, ${bg.gradient.stops
            .map((s) => `${s.color} ${s.position}%`)
            .join(", ")})`,
        }
      : { backgroundColor: bg.type === "color" ? bg.color : workingTemplate.colors.background };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-[#0f0f1a]/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Éditeur de Template</span>
          {isBuiltIn && (
            <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded">
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
          <div className="border border-white/10 rounded-lg p-3 bg-[#16162a]">
            <Label className="text-[11px] text-white/40">Nom du template</Label>
            <Input
              value={workingTemplate.name}
              onChange={(e) => update({ name: e.target.value })}
              className="h-8 text-sm mt-1"
            />
          </div>

          {/* Typography */}
          <Section title="Typographie" icon={<Type className="h-3.5 w-3.5" />}>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Police titres</label>
              <select
                value={workingTemplate.fonts.heading}
                onChange={(e) =>
                  update({ fonts: { ...workingTemplate.fonts, heading: e.target.value } })
                }
                className="w-full h-8 px-2 text-xs rounded-md border border-white/10 bg-[#0f0f1a]"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Police corps</label>
              <select
                value={workingTemplate.fonts.body}
                onChange={(e) =>
                  update({ fonts: { ...workingTemplate.fonts, body: e.target.value } })
                }
                className="w-full h-8 px-2 text-xs rounded-md border border-white/10 bg-[#0f0f1a]"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <SliderField
              label="Taille titre"
              value={workingTemplate.fontSizes?.heading || 48}
              min={24}
              max={96}
              step={2}
              onChange={(v) => update({ fontSizes: { ...workingTemplate.fontSizes, heading: v } })}
            />
            <SliderField
              label="Taille corps"
              value={workingTemplate.fontSizes?.body || 18}
              min={12}
              max={32}
              step={1}
              onChange={(v) => update({ fontSizes: { ...workingTemplate.fontSizes, body: v } })}
            />
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
              {(["color", "image", "gradient"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateBackground({ type: t })}
                  className={cn(
                    "flex-1 py-1.5 text-[11px] rounded-md border transition-colors capitalize",
                    bg.type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-white/10 text-white/40"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {bg.type === "image" && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed border-white/10 rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {bg.imageUrl ? (
                    <img src={bg.imageUrl} alt="Background" className="max-h-24 mx-auto rounded" />
                  ) : (
                    <span className="text-[11px] text-white/40">Cliquer pour uploader une image</span>
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
            {bg.type === "gradient" && (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-white/40 block mb-1">Direction</label>
                  <Input
                    value={bg.gradient?.direction || "135deg"}
                    onChange={(e) =>
                      updateBackground({
                        gradient: { ...(bg.gradient || { direction: "135deg", stops: [] }), direction: e.target.value },
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 block">Stops</label>
                  {(bg.gradient?.stops || []).map((stop, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={stop.color}
                        onChange={(e) => {
                          const stops = [...(bg.gradient?.stops || [])];
                          stops[idx] = { ...stop, color: e.target.value };
                          updateBackground({ gradient: { ...(bg.gradient || { direction: "135deg", stops: [] }), stops } });
                        }}
                        className="w-6 h-6 rounded cursor-pointer border border-white/10 p-0.5"
                      />
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[stop.position]}
                        onValueChange={(v) => {
                          const stops = [...(bg.gradient?.stops || [])];
                          stops[idx] = { ...stop, position: (v as number[])[0] };
                          updateBackground({ gradient: { ...(bg.gradient || { direction: "135deg", stops: [] }), stops } });
                        }}
                        className="flex-1"
                      />
                      <span className="text-[10px] text-white/40 w-6 text-right">{stop.position}%</span>
                      <button
                        onClick={() => {
                          const stops = (bg.gradient?.stops || []).filter((_, i) => i !== idx);
                          updateBackground({ gradient: { ...(bg.gradient || { direction: "135deg", stops: [] }), stops } });
                        }}
                        className="text-[10px] text-red-500 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] mt-1"
                    onClick={() => {
                      const stops = [...(bg.gradient?.stops || []), { color: "#ffffff", position: 50 }];
                      updateBackground({ gradient: { ...(bg.gradient || { direction: "135deg", stops: [] }), stops } });
                    }}
                  >
                    + Ajouter un stop
                  </Button>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-white/40">Opacité image (%)</label>
                <span className="text-[11px] text-white/40 tabular-nums">{bg.opacity || 100}</span>
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

          {/* Spacing */}
          <Section title="Espacement" icon={<BoxSelect className="h-3.5 w-3.5" />} defaultOpen={false}>
            <SliderField label="xs" value={spacing.xs} min={0} max={16} step={1} onChange={(v) => updateSpacing({ xs: v })} />
            <SliderField label="sm" value={spacing.sm} min={0} max={24} step={1} onChange={(v) => updateSpacing({ sm: v })} />
            <SliderField label="md" value={spacing.md} min={0} max={40} step={2} onChange={(v) => updateSpacing({ md: v })} />
            <SliderField label="lg" value={spacing.lg} min={0} max={64} step={4} onChange={(v) => updateSpacing({ lg: v })} />
            <SliderField label="xl" value={spacing.xl} min={0} max={96} step={4} onChange={(v) => updateSpacing({ xl: v })} />
          </Section>

          {/* Border Radius */}
          <Section title="Arrondis" icon={<Square className="h-3.5 w-3.5" />} defaultOpen={false}>
            <SliderField label="sm" value={radius.sm} min={0} max={16} step={1} onChange={(v) => updateBorderRadius({ sm: v })} />
            <SliderField label="md" value={radius.md} min={0} max={24} step={1} onChange={(v) => updateBorderRadius({ md: v })} />
            <SliderField label="lg" value={radius.lg} min={0} max={40} step={2} onChange={(v) => updateBorderRadius({ lg: v })} />
            <SliderField label="xl" value={radius.xl} min={0} max={60} step={2} onChange={(v) => updateBorderRadius({ xl: v })} />
          </Section>

          {/* Shadows */}
          <Section title="Ombres" icon={<Sparkles className="h-3.5 w-3.5" />} defaultOpen={false}>
            <ShadowInput label="sm" value={shadows.sm} onChange={(v) => updateShadows({ sm: v })} />
            <ShadowInput label="md" value={shadows.md} onChange={(v) => updateShadows({ md: v })} />
            <ShadowInput label="lg" value={shadows.lg} onChange={(v) => updateShadows({ lg: v })} />
            <ShadowInput label="glow (optionnel)" value={shadows.glow || ""} onChange={(v) => updateShadows({ glow: v || undefined })} />
          </Section>

          {/* Header / Footer */}
          <Section title="En-tête / Pied" icon={<FileText className="h-3.5 w-3.5" />} defaultOpen={false}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="header-enabled"
                  checked={header.enabled}
                  onChange={(e) => updateHeader({ enabled: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-white/10"
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
                      className="h-3.5 w-3.5 rounded border-white/10"
                    />
                    <Label htmlFor="header-date" className="text-[11px] cursor-pointer">
                      Date
                    </Label>
                  </div>
                </>
              )}

              <div className="border-t border-white/10 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="footer-enabled"
                    checked={footer.enabled}
                    onChange={(e) => updateFooter({ enabled: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-white/10"
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
                        className="h-3.5 w-3.5 rounded border-white/10"
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
                        className="h-3.5 w-3.5 rounded border-white/10"
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
          <div className="flex items-center justify-center gap-2 px-4 py-2 border-b bg-[#0f0f1a]/95 shrink-0">
            {["title", "title-content", "two-column", "title-only", "content-only"].map((layout) => (
              <button
                key={layout}
                onClick={() => setPreviewLayout(layout)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md border transition-colors capitalize",
                  previewLayout === layout
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/10 text-white/40 hover:text-foreground"
                )}
              >
                {layout.replace(/-/g, " ")}
              </button>
            ))}
          </div>

          {/* Slide preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-white/10/20 overflow-auto">
            <div
              className="relative overflow-hidden border"
              style={{
                width: "640px",
                height: "360px",
                borderRadius: `${radius.md}px`,
                boxShadow: shadows.lg,
                ...bgStyle,
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
              {/* Glow overlay */}
              {shadows.glow && (
                <div
                  className="absolute inset-0 pointer-events-none z-0"
                  style={{ boxShadow: `inset ${shadows.glow}` }}
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
                  paddingTop: header.enabled ? "28px" : `${spacing.md}px`,
                  paddingBottom: footer.enabled ? "24px" : `${spacing.md}px`,
                  paddingLeft: `${spacing.lg}px`,
                  paddingRight: `${spacing.lg}px`,
                }}
              >
                <div className="flex-1 flex flex-col justify-center">
                  {previewLayout !== "content-only" && (
                    <h2
                      className="font-bold"
                      style={{
                        fontFamily: workingTemplate.fonts.heading,
                        color: workingTemplate.colors.foreground,
                        fontSize: `${workingTemplate.fontSizes?.heading || 48}px`,
                        lineHeight: 1.2,
                        marginBottom: `${spacing.md}px`,
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
                        borderRadius: `${radius.sm}px`,
                        padding: `${spacing.md}px`,
                        backgroundColor: workingTemplate.colors.muted,
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
