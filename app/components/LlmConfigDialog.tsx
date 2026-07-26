"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useLlmStore } from "../stores/llmStore";
import { Settings, Check, AlertCircle, Loader2 } from "lucide-react";
import { checkOllamaAvailability, fetchOllamaModels } from "@/lib/llm";

export function LlmConfigDialog() {
  const { config, setConfig, setAvailable, setModels } = useLlmStore();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const available = await checkOllamaAvailability(config.baseUrl);
      setAvailable(available);
      setTestResult(available);
      if (available) {
        const models = await fetchOllamaModels(config.baseUrl);
        setModels(models);
        setLocalModels(models);
      }
    } catch {
      setTestResult(false);
      setAvailable(false);
    } finally {
      setTesting(false);
    }
  }, [config.baseUrl, setAvailable, setModels]);

  // Auto-test connection when dialog opens
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      testConnection();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, testConnection]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Configuration LLM">
          <Settings className="h-4 w-4" />
        </Button>
      } />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuration LLM</DialogTitle>
          <DialogDescription>
            Configurez la connexion à Ollama pour la génération de slides.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="baseUrl">URL Ollama</Label>
            <Input
              id="baseUrl"
              value={config.baseUrl}
              onChange={(e) => setConfig({ baseUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="model">Modèle</Label>
            <Input
              id="model"
              value={config.model}
              onChange={(e) => setConfig({ model: e.target.value })}
              placeholder="llama3.2"
              list="model-suggestions"
            />
            <datalist id="model-suggestions">
              {localModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="temperature">Température</Label>
              <span className="text-xs text-muted-foreground">{config.temperature}</span>
            </div>
            <Slider
              id="temperature"
              min={0}
              max={2}
              step={0.1}
              value={[config.temperature]}
              onValueChange={(v) => {
                const val = Array.isArray(v) ? v[0] : v;
                setConfig({ temperature: val });
              }}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <span className="text-xs text-muted-foreground">{config.maxTokens}</span>
            </div>
            <Slider
              id="maxTokens"
              min={512}
              max={8192}
              step={512}
              value={[config.maxTokens]}
              onValueChange={(v) => {
                const val = Array.isArray(v) ? v[0] : v;
                setConfig({ maxTokens: val });
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">Prompt système</Label>
            <textarea
              id="systemPrompt"
              value={config.systemPrompt}
              onChange={(e) => setConfig({ systemPrompt: e.target.value })}
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : testResult === true ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : testResult === false ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <div className="h-4 w-4" />
            )}
            <span className="text-xs">
              {testing
                ? "Test en cours..."
                : testResult === true
                ? `Connecté (${localModels.length} modèles)`
                : testResult === false
                ? "Non connecté"
                : "Cliquez sur Tester pour vérifier"}
            </span>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Tester
          </Button>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
