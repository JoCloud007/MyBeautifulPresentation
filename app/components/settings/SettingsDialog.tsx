"use client";

import { useState, useEffect } from "react";
import { useLlmStore } from "@/app/stores/llmStore";
import { LlmProvider } from "@/app/types/llm";
import { checkLlmAvailability, fetchLlmModels } from "@/lib/llm";
import {
  usePresentationStore,
  DEFAULT_INTERVIEW_PERSONAS,
  InterviewPersona,
} from "@/app/stores/presentationStore";

interface McpServer {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface DbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  url: string;
}

const DEFAULT_MCP_SERVERS: McpServer[] = [
  { id: "mcp-pptx", name: "MCP PPTX", url: "http://mcp-pptx:3050", type: "pptx" },
  { id: "mcp-mermaid", name: "MCP Mermaid", url: "http://mcp-mermaid:3051", type: "mermaid" },
  { id: "mcp-excalidraw", name: "MCP Excalidraw", url: "http://mcp-excalidraw:3052", type: "excalidraw" },
  { id: "mcp-web", name: "MCP Web", url: "http://mcp-web:3053", type: "web" },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABS = [
  { id: "ai", label: "Configuration AI" },
  { id: "mcp", label: "Serveurs MCP" },
  { id: "personas", label: "Personas Interview" },
  { id: "db", label: "Base de données" },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState("ai");
  const { config, setConfig } = useLlmStore();

  const interviewPersonas = usePresentationStore((s) => s.interviewPersonas);
  const setInterviewPersonas = usePresentationStore((s) => s.setInterviewPersonas);
  const addInterviewPersona = usePresentationStore((s) => s.addInterviewPersona);
  const updateInterviewPersona = usePresentationStore((s) => s.updateInterviewPersona);
  const removeInterviewPersona = usePresentationStore((s) => s.removeInterviewPersona);

  // AI form state — synced with store when dialog opens
  const [aiForm, setAiForm] = useState({
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: config.apiKey || "",
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
    skipSslVerification: config.skipSslVerification || false,
  });

  // MCP state
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [mcpForm, setMcpForm] = useState({ name: "", url: "", type: "generic" });
  const [mcpTestStatus, setMcpTestStatus] = useState<{ [id: string]: "idle" | "testing" | "ok" | "error" }>({});
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [editMcpForm, setEditMcpForm] = useState({ name: "", url: "", type: "generic" });

  // Persona form state
  const [personaForm, setPersonaForm] = useState({
    name: "",
    description: "",
    prompt: "",
    skills: "",
  });
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  // AI connection test state
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // DB state
  const [dbForm, setDbForm] = useState<DbConfig>({
    host: "localhost",
    port: "5432",
    user: "",
    password: "",
    database: "mybp",
    url: "",
  });

  // Sync aiForm with store only when dialog opens
  useEffect(() => {
    if (open) {
      setAiForm({
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey || "",
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        systemPrompt: config.systemPrompt,
        skipSslVerification: config.skipSslVerification || false,
      });
    }
  }, [open]);

  useEffect(() => {
    if (typeof window !== "undefined" && open) {
      const savedMcps = localStorage.getItem("mybp_mcp_servers");
      if (savedMcps) {
        try {
          const parsed = JSON.parse(savedMcps);
          if (Array.isArray(parsed)) {
            // Migrate old localhost URLs to Docker service names
            const OLD_LOCALHOST_URL = /^https?:\/\/localhost:\d+\/?$/i;
            // Migrate legacy per-project ports (3004-3007, colliding with
            // other compose stacks) to the shipped defaults (3050-3053)
            const LEGACY_SERVICE_PORTS: Record<string, string> = {
              "mcp-pptx:3004": "http://mcp-pptx:3050",
              "mcp-mermaid:3005": "http://mcp-mermaid:3051",
              "mcp-excalidraw:3006": "http://mcp-excalidraw:3052",
              "mcp-web:3007": "http://mcp-web:3053",
            };
            const migrated = parsed.map((mcp: any) => {
              if (mcp.url && OLD_LOCALHOST_URL.test(mcp.url)) {
                const type = mcp.type || "generic";
                if (type === "pptx") return { ...mcp, url: "http://mcp-pptx:3050" };
                if (type === "mermaid") return { ...mcp, url: "http://mcp-mermaid:3051" };
                if (type === "excalidraw") return { ...mcp, url: "http://mcp-excalidraw:3052" };
                if (type === "web") return { ...mcp, url: "http://mcp-web:3053" };
                return mcp;
              }
              if (mcp.url && typeof mcp.url === "string") {
                const legacy = LEGACY_SERVICE_PORTS[mcp.url.replace(/^https?:\/\//i, "")];
                if (legacy) return { ...mcp, url: legacy };
              }
              return mcp;
            });
            // Ensure all default MCP servers are present
            const merged = [...migrated];
            // Ensure all default MCP servers are present — except those the
            // user explicitly deleted (tracked in mybp_mcp_removed), so a
            // removal survives dialog re-opens instead of being undone here.
            let removedIds: string[] = [];
            try {
              removedIds = JSON.parse(localStorage.getItem("mybp_mcp_removed") || "[]");
            } catch {
              removedIds = [];
            }
            for (const def of DEFAULT_MCP_SERVERS) {
              if (removedIds.includes(def.id)) continue;
              if (!merged.some((m) => m.id === def.id)) {
                merged.push(def);
              }
            }
            setMcps(merged);
            // Save merged list back to localStorage
            localStorage.setItem("mybp_mcp_servers", JSON.stringify(merged));
          } else {
            setMcps(DEFAULT_MCP_SERVERS);
          }
        } catch {
          setMcps(DEFAULT_MCP_SERVERS);
        }
      } else {
        setMcps(DEFAULT_MCP_SERVERS);
      }
      const savedDb = localStorage.getItem("mybp_db_config");
      if (savedDb) {
        try {
          const parsed = JSON.parse(savedDb);
          setDbForm((prev) => ({ ...prev, ...parsed }));
        } catch {
          /* ignore */
        }
      }
    }
  }, [open]);

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setAvailableModels([]);
    try {
      const testConfig = {
        provider: aiForm.provider as LlmProvider,
        baseUrl: aiForm.baseUrl,
        model: aiForm.model,
        apiKey: aiForm.apiKey || undefined,
        temperature: aiForm.temperature,
        maxTokens: aiForm.maxTokens,
        systemPrompt: aiForm.systemPrompt,
        skipSslVerification: aiForm.skipSslVerification,
      };
      const available = await checkLlmAvailability(testConfig);
      if (available) {
        const models = await fetchLlmModels(testConfig);
        setAvailableModels(models);
        setTestStatus("success");
      } else {
        setTestStatus("error");
      }
    } catch {
      setTestStatus("error");
    }
  };

  const handleSave = () => {
    // Save AI config — include ALL fields so nothing gets lost
    setConfig({
      provider: aiForm.provider as LlmProvider,
      baseUrl: aiForm.baseUrl,
      model: aiForm.model,
      apiKey: aiForm.apiKey || undefined,
      temperature: aiForm.temperature,
      maxTokens: aiForm.maxTokens,
      systemPrompt: aiForm.systemPrompt,
      skipSslVerification: aiForm.skipSslVerification,
    });
    // Save MCP
    localStorage.setItem("mybp_mcp_servers", JSON.stringify(mcps));
    // Save DB — exclude password from plaintext storage
    const { password: _, ...dbFormWithoutPassword } = dbForm;
    localStorage.setItem("mybp_db_config", JSON.stringify(dbFormWithoutPassword));
    onOpenChange(false);
  };

  const addMcp = () => {
    if (!mcpForm.name || !mcpForm.url) return;
    setMcps([...mcps, { id: crypto.randomUUID?.() ?? Date.now().toString(), ...mcpForm }]);
    setMcpForm({ name: "", url: "", type: "generic" });
  };

  const removeMcp = (id: string) => {
    // Track removals of default servers so the merge-on-open doesn't re-add them
    if (DEFAULT_MCP_SERVERS.some((def) => def.id === id)) {
      const removedRaw = localStorage.getItem("mybp_mcp_removed");
      let removedIds: string[] = [];
      try {
        removedIds = JSON.parse(removedRaw || "[]");
      } catch {
        removedIds = [];
      }
      if (!removedIds.includes(id)) {
        removedIds.push(id);
        localStorage.setItem("mybp_mcp_removed", JSON.stringify(removedIds));
      }
    }
    setMcps(mcps.filter((m) => m.id !== id));
  };

  const startEditMcp = (mcp: McpServer) => {
    setEditingMcpId(mcp.id);
    setEditMcpForm({ name: mcp.name, url: mcp.url, type: mcp.type });
  };

  const saveEditMcp = () => {
    if (!editingMcpId || !editMcpForm.name || !editMcpForm.url) return;
    setMcps(mcps.map((m) => (m.id === editingMcpId ? { ...m, ...editMcpForm } : m)));
    setEditingMcpId(null);
  };

  const cancelEditMcp = () => {
    setEditingMcpId(null);
    setEditMcpForm({ name: "", url: "", type: "generic" });
  };

  const handleAddPersona = () => {
    if (!personaForm.name.trim() || !personaForm.prompt.trim()) return;
    const newPersona: InterviewPersona = {
      id: editingPersonaId || (crypto.randomUUID?.() ?? Date.now().toString()),
      name: personaForm.name.trim(),
      description: personaForm.description.trim(),
      prompt: personaForm.prompt.trim(),
      skills: personaForm.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (editingPersonaId) {
      updateInterviewPersona(editingPersonaId, newPersona);
      setEditingPersonaId(null);
    } else {
      addInterviewPersona(newPersona);
    }
    setPersonaForm({ name: "", description: "", prompt: "", skills: "" });
  };

  const handleEditPersona = (p: InterviewPersona) => {
    setPersonaForm({
      name: p.name,
      description: p.description,
      prompt: p.prompt,
      skills: p.skills.join(", "),
    });
    setEditingPersonaId(p.id);
  };

  const handleCancelEditPersona = () => {
    setPersonaForm({ name: "", description: "", prompt: "", skills: "" });
    setEditingPersonaId(null);
  };

  const allPersonas = [...DEFAULT_INTERVIEW_PERSONAS, ...interviewPersonas];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Paramètres</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-600 text-xl cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* AI Tab */}
          {activeTab === "ai" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Provider
                </label>
                <select
                  value={aiForm.provider}
                  onChange={(e) => setAiForm({ ...aiForm, provider: e.target.value as LlmProvider })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500 bg-white"
                >
                  <option value="ollama">Ollama (local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="generic-openai">OpenAI-compatible (Generic)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  URL Base
                </label>
                <input
                  type="text"
                  value={aiForm.baseUrl}
                  onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  placeholder={aiForm.provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"}
                />
              </div>

              {(aiForm.provider === "openai" || aiForm.provider === "generic-openai") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Clé API
                  </label>
                  <input
                    type="password"
                    value={aiForm.apiKey}
                    onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                    placeholder="sk-..."
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Modèle
                  </label>
                  <button
                    onClick={handleTestConnection}
                    disabled={testStatus === "testing"}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                      testStatus === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : testStatus === "error"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {testStatus === "testing"
                      ? "Test en cours..."
                      : testStatus === "success"
                        ? "Connecté"
                        : testStatus === "error"
                          ? "Échec"
                          : "Tester"}
                  </button>
                </div>
                {availableModels.length > 0 ? (
                  <select
                    value={aiForm.model}
                    onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500 bg-white"
                  >
                    <option value="">Choisir un modèle...</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={aiForm.model}
                    onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                    placeholder="llama3.2, gpt-4o, ..."
                  />
                )}
                {testStatus === "success" && availableModels.length > 0 && (
                  <p className="text-[11px] text-green-600 mt-1">{availableModels.length} modèle(s) disponible(s)</p>
                )}
                {testStatus === "error" && (
                  <p className="text-[11px] text-red-600 mt-1">Impossible de se connecter. Vérifiez l'URL et le provider.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Température
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={aiForm.temperature}
                    onChange={(e) => setAiForm({ ...aiForm, temperature: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={aiForm.maxTokens}
                    onChange={(e) => setAiForm({ ...aiForm, maxTokens: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prompt système
                </label>
                <textarea
                  value={aiForm.systemPrompt}
                  onChange={(e) => setAiForm({ ...aiForm, systemPrompt: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500 resize-none"
                  placeholder="Instructions système pour le LLM..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="skipSsl"
                  type="checkbox"
                  checked={aiForm.skipSslVerification}
                  onChange={(e) => setAiForm({ ...aiForm, skipSslVerification: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="skipSsl" className="text-sm cursor-pointer text-slate-700">
                  Ignorer la vérification SSL
                </label>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">
                Utile derrière un proxy d'entreprise avec inspection SSL.
              </p>
            </div>
          )}

          {/* MCP Tab */}
          {activeTab === "mcp" && (
            <div className="space-y-4">
              <div className="space-y-2">
                {mcps.map((mcp) => {
                  const testStatus = mcpTestStatus[mcp.id] || "idle";
                  const isEditing = editingMcpId === mcp.id;
                  const testMcp = async () => {
                    setMcpTestStatus((prev) => ({ ...prev, [mcp.id]: "testing" }));
                    try {
                      const res = await fetch(`/api/mcp/health?url=${encodeURIComponent(mcp.url)}`);
                      const data = await res.json();
                      setMcpTestStatus((prev) => ({ ...prev, [mcp.id]: data.ok ? "ok" : "error" }));
                    } catch {
                      setMcpTestStatus((prev) => ({ ...prev, [mcp.id]: "error" }));
                    }
                  };
                  if (isEditing) {
                    return (
                      <div key={mcp.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex-1 grid gap-2 mr-4">
                          <input
                            type="text"
                            value={editMcpForm.name}
                            onChange={(e) => setEditMcpForm({ ...editMcpForm, name: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-sm outline-none focus:border-slate-500"
                            placeholder="Nom"
                          />
                          <input
                            type="text"
                            value={editMcpForm.url}
                            onChange={(e) => setEditMcpForm({ ...editMcpForm, url: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-sm outline-none focus:border-slate-500"
                            placeholder="URL"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveEditMcp}
                            className="px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                          >
                            Sauvegarder
                          </button>
                          <button
                            onClick={cancelEditMcp}
                            className="px-2 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={mcp.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{mcp.name}</div>
                        <div className="text-xs text-slate-500">{mcp.url}</div>
                        <div className="text-xs text-slate-400">{mcp.type}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={testMcp}
                          disabled={testStatus === "testing"}
                          className={`px-2 py-1 text-xs border rounded cursor-pointer ${
                            testStatus === "ok"
                              ? "text-green-600 border-green-200 bg-green-50"
                              : testStatus === "error"
                                ? "text-red-600 border-red-200 bg-red-50"
                                : "text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {testStatus === "testing" ? "Test..." : testStatus === "ok" ? "OK" : testStatus === "error" ? "KO" : "Tester"}
                        </button>
                        <button
                          onClick={() => startEditMcp(mcp)}
                          className="px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 cursor-pointer"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => removeMcp(mcp.id)}
                          className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
                {mcps.length === 0 && (
                  <div className="text-sm text-slate-400 text-center py-4">Aucun serveur MCP configuré</div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">Ajouter un serveur</div>
                <div className="grid gap-2">
                  <input
                    type="text"
                    placeholder="Nom (ex: MCP PPTX)"
                    value={mcpForm.name}
                    onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="URL (ex: http://localhost:3050)"
                    value={mcpForm.url}
                    onChange={(e) => setMcpForm({ ...mcpForm, url: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={addMcp}
                    className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 cursor-pointer"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Personas Tab */}
          {activeTab === "personas" && (
            <div className="space-y-4">
              <div className="space-y-2">
                {allPersonas.map((p) => {
                  const isDefault = DEFAULT_INTERVIEW_PERSONAS.some((d) => d.id === p.id);
                  return (
                    <div key={p.id} className="flex items-start justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-700">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.description}</div>
                        {p.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.skills.map((skill) => (
                              <span key={skill} className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[10px] rounded">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!isDefault && (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => handleEditPersona(p)}
                            className="px-2 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => removeInterviewPersona(p.id)}
                            className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                      {isDefault && (
                        <span className="ml-2 px-2 py-1 text-[10px] text-slate-400 border border-slate-200 rounded bg-white">
                          Défaut
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">
                  {editingPersonaId ? "Modifier le persona" : "Ajouter un persona"}
                </div>
                <div className="grid gap-2">
                  <input
                    type="text"
                    placeholder="Nom (ex: Product Manager)"
                    value={personaForm.name}
                    onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Description courte"
                    value={personaForm.description}
                    onChange={(e) => setPersonaForm({ ...personaForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                  <textarea
                    placeholder="Prompt système du persona (instructions pour le LLM)"
                    value={personaForm.prompt}
                    onChange={(e) => setPersonaForm({ ...personaForm, prompt: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500 resize-none"
                  />
                  <input
                    type="text"
                    placeholder="Skills, séparés par des virgules (ex: stratégie, UX, data)"
                    value={personaForm.skills}
                    onChange={(e) => setPersonaForm({ ...personaForm, skills: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddPersona}
                      className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 cursor-pointer"
                    >
                      {editingPersonaId ? "Enregistrer" : "Ajouter"}
                    </button>
                    {editingPersonaId && (
                      <button
                        onClick={handleCancelEditPersona}
                        className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DB Tab */}
          {activeTab === "db" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  URL de connexion (optionnel — prioritaire)
                </label>
                <input
                  type="text"
                  value={dbForm.url}
                  onChange={(e) => setDbForm({ ...dbForm, url: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  placeholder="postgresql://user:pass@host:5432/db"
                />
              </div>

              <div className="text-sm text-slate-500 text-center">— ou —</div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hôte</label>
                  <input
                    type="text"
                    value={dbForm.host}
                    onChange={(e) => setDbForm({ ...dbForm, host: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                  <input
                    type="text"
                    value={dbForm.port}
                    onChange={(e) => setDbForm({ ...dbForm, port: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Utilisateur</label>
                  <input
                    type="text"
                    value={dbForm.user}
                    onChange={(e) => setDbForm({ ...dbForm, user: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
                  <input
                    type="password"
                    value={dbForm.password}
                    onChange={(e) => setDbForm({ ...dbForm, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Base de données</label>
                  <input
                    type="text"
                    value={dbForm.database}
                    onChange={(e) => setDbForm({ ...dbForm, database: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 cursor-pointer"
          >
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}
