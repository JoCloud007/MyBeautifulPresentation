"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { exportToPPTX } from "@/lib/pptxExport";
import { LlmConfigDialog } from "./LlmConfigDialog";
import { PptxImportDialog } from "./PptxImportDialog";
import {
  Download,
  FilePlus,
  FileUp,
  LayoutTemplate,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Toolbar() {
  const { presentation, resetPresentation, updatePresentationMeta } = usePresentationStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Local state for metadata dialog to enable cancel/revert
  const [metaForm, setMetaForm] = useState({
    title: "",
    subtitle: "",
    author: "",
  });

  const handleExport = () => {
    if (!presentation) return;
    exportToPPTX(presentation, template);
  };

  const startEditingTitle = () => {
    setTempTitle(presentation?.title || "");
    setEditingTitle(true);
  };

  const saveTitle = () => {
    updatePresentationMeta({ title: tempTitle });
    setEditingTitle(false);
  };

  const cancelTitle = () => {
    setEditingTitle(false);
  };

  const openMetaDialog = useCallback(() => {
    setMetaForm({
      title: presentation?.title || "",
      subtitle: presentation?.subtitle || "",
      author: presentation?.author || "",
    });
    setMetaOpen(true);
  }, [presentation]);

  const saveMeta = () => {
    updatePresentationMeta({
      title: metaForm.title,
      subtitle: metaForm.subtitle,
      author: metaForm.author,
    });
    setMetaOpen(false);
  };

  const cancelMeta = () => {
    setMetaOpen(false);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3 min-w-0">
        <LayoutTemplate className="h-5 w-5 text-primary flex-shrink-0" />
        <span className="font-semibold text-sm hidden sm:inline flex-shrink-0">
          MyBeautifulPresentation
        </span>
        <div className="h-4 w-px bg-border hidden sm:block flex-shrink-0" />

        {/* Editable title */}
        {editingTitle ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <Input
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") cancelTitle();
              }}
              autoFocus
              className="h-7 text-sm w-[200px]"
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveTitle}>
              <Check className="h-3.5 w-3.5 text-green-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelTitle}>
              <X className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        ) : (
          <button
            onClick={startEditingTitle}
            className="text-sm font-medium truncate max-w-[200px] hover:text-primary transition-colors flex items-center gap-1"
            title="Cliquez pour modifier le titre"
          >
            {presentation?.title || "Nouvelle Présentation"}
            <Pencil className="h-3 w-3 opacity-0 hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={resetPresentation}
        >
          <FilePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nouveau</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setImportOpen(true)}
        >
          <FileUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Importer</span>
        </Button>

        <PptxImportDialog open={importOpen} onOpenChange={setImportOpen} />

        <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
          <DialogTrigger render={
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs hidden sm:flex" onClick={openMetaDialog}>
              <Pencil className="h-3.5 w-3.5" />
              Métadonnées
            </Button>
          } />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Métadonnées de la présentation</DialogTitle>
              <DialogDescription>
                Modifiez les informations de votre présentation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="pres-title">Titre</Label>
                <Input
                  id="pres-title"
                  value={metaForm.title}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pres-subtitle">Sous-titre</Label>
                <Input
                  id="pres-subtitle"
                  value={metaForm.subtitle}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="Sous-titre optionnel"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pres-author">Auteur</Label>
                <Input
                  id="pres-author"
                  value={metaForm.author}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, author: e.target.value }))}
                  placeholder="Votre nom"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelMeta}>
                Annuler
              </Button>
              <Button size="sm" onClick={saveMeta}>
                Enregistrer
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exporter</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-2" />
              PPTX (PowerPoint)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <LlmConfigDialog />
      </div>
    </div>
  );
}
