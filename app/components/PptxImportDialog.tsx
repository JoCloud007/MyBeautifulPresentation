"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importPPTX } from "@/lib/pptxImport";
import { usePresentationStore } from "../stores/presentationStore";
import {
  Upload,
  FileUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  FileType,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PptxImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isPptxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pptx");
}

export function PptxImportDialog({ open, onOpenChange }: PptxImportDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    fileName: string;
    slideCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setError(null);
    setSuccess(null);
    setIsLoading(false);
    setIsDragging(false);
  }, []);

  const handleImport = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const pres = await importPPTX(file);
        usePresentationStore.getState().setPresentation(pres);
        setSuccess({
          fileName: file.name,
          slideCount: pres.slides.length,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Erreur lors de l'import du fichier PPTX"
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (isPptxFile(file)) {
        handleImport(file);
      } else {
        setError("Veuillez déposer un fichier .pptx");
      }
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation
    setTimeout(() => {
      resetState();
    }, 200);
  };

  // Intercept onOpenChange to reset state when closing via Escape or overlay click
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setTimeout(() => {
        resetState();
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            Importer un fichier PPTX
          </DialogTitle>
          <DialogDescription>
            Importez une présentation PowerPoint existante pour l&apos;éditer dans
            MyBeautifulPresentation.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">Import réussi !</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">{success.fileName}</span> —{" "}
                {success.slideCount} slide{success.slideCount > 1 ? "s" : ""}{" "}
                importée{success.slideCount > 1 ? "s" : ""}
              </p>
            </div>
            <Button onClick={handleClose} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Continuer
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30 hover:bg-muted/50"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pptx"
                className="hidden"
                onChange={handleFileChange}
              />

              {isLoading ? (
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              ) : (
                <Upload
                  className={cn(
                    "h-10 w-10 transition-colors",
                    isDragging ? "text-primary" : "text-muted-foreground"
                  )}
                />
              )}

              <div className="text-center">
                {isLoading ? (
                  <p className="text-sm font-medium">Analyse du fichier...</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Glissez-déposez un fichier ici
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ou cliquez pour parcourir — format{" "}
                      <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">
                        .pptx
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Erreur d&apos;import</p>
                  <p className="mt-0.5">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="flex-shrink-0 hover:text-red-900"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Info */}
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground">
              <FileType className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <p>
                Les formes complexes, images et animations ne sont pas
                importées. Seuls le texte, la structure des slides et les notes
                sont extraits.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
