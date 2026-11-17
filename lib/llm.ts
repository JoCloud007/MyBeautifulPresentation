import { LlmConfig, LlmMessage, LlmProvider, OllamaChatRequest, OllamaResponse, OpenAIChatRequest, OpenAIChatResponse } from "@/app/types/llm";
import { Template } from "@/app/types/template";
import { InterviewPersona } from "@/app/stores/presentationStore";
import type { DeckOperation, DeckSlidePayload } from "./deckEdit";

// Internal header used to carry the provider API key to our own proxy
// routes without ever placing it in a URL (query strings leak into logs,
// browser history and Referer headers).
const API_KEY_HEADER = "X-Api-Key";

function apiKeyHeaders(config: Pick<LlmConfig, "apiKey">): Record<string, string> {
  return config.apiKey ? { [API_KEY_HEADER]: config.apiKey } : {};
}

export async function checkLlmAvailability(config: LlmConfig): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const params = new URLSearchParams({ baseUrl: config.baseUrl, provider: config.provider });
    const res = await fetch(`/api/llm?${params.toString()}`, {
      method: "GET",
      headers: apiKeyHeaders(config),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function detectLlmProvider(
  baseUrl: string,
  apiKey?: string
): Promise<{ provider: LlmProvider | null; models: string[] }> {
  try {
    const params = new URLSearchParams({ baseUrl });
    const res = await fetch(`/api/llm/detect?${params.toString()}`, {
      method: "GET",
      headers: apiKeyHeaders({ apiKey }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { provider: null, models: [], ...data };
    }
    const data = await res.json();
    return {
      provider: data.provider || null,
      models: data.models || [],
    };
  } catch {
    return { provider: null, models: [] };
  }
}

export async function fetchLlmModels(config: LlmConfig): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const params = new URLSearchParams({ baseUrl: config.baseUrl, provider: config.provider });
    const res = await fetch(`/api/llm?${params.toString()}`, {
      headers: apiKeyHeaders(config),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const isOpenAICompatible = config.provider === "openai" || config.provider === "vllm" || config.provider === "generic-openai";
    if (isOpenAICompatible) {
      return (data.data || []).map((m: { id: string }) => m.id);
    }
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function* streamLlmChat(
  config: LlmConfig,
  messages: LlmMessage[],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const isOpenAI = config.provider === "openai" || config.provider === "vllm" || config.provider === "generic-openai";
  const body = isOpenAI
    ? {
        model: config.model,
        messages,
        stream: true,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }
    : {
        model: config.model,
        messages,
        stream: true,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      };

  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeaders(config) },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      provider: config.provider,
      ...body,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`LLM error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        // OpenAI SSE format: data: {...}
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          if (jsonStr === "[DONE]") continue;
          try {
            const chunk: OpenAIChatResponse = JSON.parse(jsonStr);
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // ignore malformed JSON
          }
          continue;
        }
        // Ollama NDJSON format
        try {
          const chunk: OllamaResponse = JSON.parse(line);
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush any remaining bytes from the TextDecoder and process trailing buffer
  buffer += decoder.decode();
  if (buffer.trim()) {
    const line = buffer.trim();
    if (line.startsWith("data: ")) {
      const jsonStr = line.slice(6);
      if (jsonStr !== "[DONE]") {
        try {
          const chunk: OpenAIChatResponse = JSON.parse(jsonStr);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // ignore malformed JSON
        }
      }
    } else {
      try {
        const chunk: OllamaResponse = JSON.parse(line);
        if (chunk.message?.content) {
          yield chunk.message.content;
        }
      } catch {
        // ignore malformed JSON
      }
    }
  }
}

export async function callLlmChat(
  config: LlmConfig,
  messages: LlmMessage[],
  signal?: AbortSignal
): Promise<string> {
  const isOpenAI = config.provider === "openai" || config.provider === "vllm" || config.provider === "generic-openai";
  const body = isOpenAI
    ? {
        model: config.model,
        messages,
        stream: false,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }
    : {
        model: config.model,
        messages,
        stream: false,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      };

  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeaders(config) },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      provider: config.provider,
      ...body,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`LLM error: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (isOpenAI) {
    const openData = data as OpenAIChatResponse;
    return openData.choices?.[0]?.message?.content || "";
  }
  const ollamaData = data as OllamaResponse;
  return ollamaData.message?.content || "";
}

export function buildStorytellingPrompt(
  storytelling: string,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `\n\nLe design de la présentation suit le template "${template.name}" (${template.description}). Adapte le ton du contenu à ce style.`
    : "";

  const baseSystemPrompt =
    config.systemPrompt ||
    "Tu es un expert en création de présentations PowerPoint professionnelles. Tu transformes un storytelling en langage naturel en slides structurées et impactantes.";

  // Sanitize user input to prevent prompt injection
  const sanitizedStory = storytelling
    .replace(/<\|im_start\|>/g, "")
    .replace(/<\|im_end\|>/g, "")
    .replace(/<<<SYS>>>/g, "")
    .replace(/<\/SYS>/g, "")
    .replace(/\[INST\]/g, "")
    .replace(/\[\/INST\]/g, "")
    .replace(/System:/gi, "Système:")
    .replace(/Assistant:/gi, "Assistant:");

  const chainOfThoughtInstructions = `\n\nMéthode de réflexion (chain-of-thought) :\nAvant de produire le JSON final, analyse le storytelling étape par étape :\n1. Identifie le public cible et l'objectif principal.\n2. Repère les dates, chronologies, ou phases temporelles (pour timeline/gantt).\n3. Repère les processus, architectures, ou flux (pour mermaid).\n4. Repère les comparaisons ou listes parallèles (pour two-column).\n5. Choisis la séquence de layouts la plus adaptée à la narration.\n6. Rédige un titre accrocheur et des contenus concis pour chaque slide.\n7. Assemble le JSON final.`;

  const fewShotExamples = `\n\nExemple few-shot :\n\nInput storytelling : "Présentation du projet Migration Cloud pour une banque. Objectif : migrer 80% des workloads sur AWS en 18 mois. Équipe de 15 personnes, 3 squads. Risques : conformité réglementaire, downtime. Livrables : architecture cible, planning, budget."\n\nOutput JSON :\n{\n  "title": "Migration Cloud : Transformer notre Infrastructure en 18 Mois",\n  "slides": [\n    { "title": "Migration Cloud", "content": "Transformer 80% de nos workloads sur AWS en 18 mois", "layout": "title" },\n    { "title": "Le Défi", "content": "• Infrastructure legacy sur serveurs physiques\\n• Coûts de maintenance croissants\\n• Manque d'agilité et de scalabilité\\n• Besoin de conformité renforcée", "layout": "title-content" },\n    { "title": "Architecture Cible", "content": "flowchart TD\\n    A[Legacy On-Premise] --> B[AWS VPC]\\n    B --> C[ECS Containers]\\n    B --> D[RDS Databases]\\n    B --> E[S3 Storage]", "layout": "mermaid" },\n    { "title": "Planning de Migration", "content": "Phase 1 | 2024-01-01 | 2024-04-30 | #4caf50\\nPhase 2 | 2024-05-01 | 2024-09-30 | #2196f3\\nPhase 3 | 2024-10-01 | 2025-06-30 | #ff9800", "layout": "gantt" },\n    { "title": "Risques & Mitigation", "content": "Risques | Mitigations\\nConformité réglementaire | Audit AWS + conseil juridique\\nDowntime | Blue-green deployment\\nCompétences | Formation interne + coaching AWS", "layout": "two-column" }\n  ]\n}`;

  return [
    {
      role: "system",
      content:
        `${baseSystemPrompt}${chainOfThoughtInstructions}${fewShotExamples}\n\nRègles STRICTES :\n1. Réponds UNIQUEMENT avec un objet JSON valide contenant 'title' (string) et 'slides' (array).\n2. Chaque slide doit avoir : title (string), content (string), layout (string parmi : title, title-content, two-column, title-only, content-only, image-left, image-right, timeline, gantt, mermaid, roadmap, architecture).\n3. Maximum 8 slides.\n4. Le titre de la présentation doit être accrocheur et professionnel.\n5. Le contenu de chaque slide doit être concis (idéalement 3-5 points clés ou 2-3 phrases percutantes).\n6. Pour la mise en page 'two-column', utilise le caractère '|' dans le content pour séparer les deux colonnes.\n7. Pour la mise en page 'timeline', chaque événement doit être sur une ligne au format : "YYYY-MM-DD - Titre de l'\u00e9vénement - Description optionnelle".\n8. Pour la mise en page 'gantt', chaque tâche doit être sur une ligne au format : "Nom de la tâche | YYYY-MM-DD (début) | YYYY-MM-DD (fin) | Couleur hex optionnelle".\n9. Utilise 'timeline' quand le storytelling contient une chronologie ou des dates clés. Utilise 'gantt' quand le storytelling décrit un projet avec des tâches sur une période. Utilise 'mermaid' quand le storytelling décrit un processus, une architecture, un flux de données, ou tout élément qui se prête à un diagramme. Le content d'une slide 'mermaid' doit contenir du code Mermaid valide (ex: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, mindmap, etc.). Utilise 'roadmap' pour les plans stratégiques avec phases et jalons. Utilise 'architecture' pour les vues d'ensemble système ou infrastructure.
10. Ne mets pas de markdown dans le JSON (pas de **, pas de #, etc.).
11. Le JSON doit être directement parsable, sans texte avant ou après.${templateContext}`,
    },
    {
      role: "user",
      content: `Crée une présentation PowerPoint professionnelle à partir de ce storytelling :\n\n---DEBUT STORY---\n${sanitizedStory}\n---FIN STORY---\n\nRéponds uniquement avec le JSON demandé.`,
    },
  ];
}

export function parseLlmSlidesResponse(raw: string): {
  title: string;
  slides: Array<{
    title: string;
    content: string;
    layout: string;
  }>;
} | null {
  try {
    // Try multiple extraction strategies
    let jsonStr = raw.trim();

    // Strategy 1: Extract from markdown code blocks
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Strategy 2: Try to find the outermost JSON object
    // by locating the first { and the last } in the text
    if (!jsonStr.startsWith("{")) {
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = raw.slice(firstBrace, lastBrace + 1).trim();
      }
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.slides && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      return {
        title: parsed.title || "Présentation générée",
        slides: parsed.slides.map((s: Record<string, unknown>) => ({
          title: String(s.title || ""),
          content: String(s.content || ""),
          layout: String(s.layout || "title-content"),
        })),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validates and normalizes a layout string to a known SlideLayout.
 */
// Backward-compatible aliases
export const checkOllamaAvailability = (baseUrl: string) =>
  checkLlmAvailability({ provider: "ollama", baseUrl, model: "", temperature: 0.7, maxTokens: 4096, systemPrompt: "" });
export const fetchOllamaModels = (baseUrl: string) =>
  fetchLlmModels({ provider: "ollama", baseUrl, model: "", temperature: 0.7, maxTokens: 4096, systemPrompt: "" });
export const streamOllamaChat = streamLlmChat;
export const callOllamaChat = callLlmChat;

export function normalizeLayout(layout: string): string {
  const validLayouts = [
    "title",
    "title-content",
    "two-column",
    "title-only",
    "content-only",
    "image-left",
    "image-right",
    "timeline",
    "gantt",
    "mermaid",
    "excalidraw",
    "roadmap",
    "architecture",
  ];
  const normalized = String(layout).toLowerCase().trim();
  return validLayouts.includes(normalized) ? normalized : "title-content";
}

// ─── Interview Prompts ───────────────────────────────────────────────────────

export function buildInterviewQuestionsPrompt(
  subject: string,
  persona: InterviewPersona,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}).`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en storytelling et création de présentations.";

  const personaPrompt = persona.prompt
    ? `\n\nPersona adopté pour cet interview : ${persona.name}.\n${persona.prompt}\n`
    : "";

  const skillsContext = persona.skills?.length
    ? `\n\nCompétences / domaines d'expertise de ce persona : ${persona.skills.join(", ")}.\n`
    : "";

  return [
    {
      role: "system",
      content: `${systemPrompt}${personaPrompt}${skillsContext}\n\nTu aides l'utilisateur à construire un storytelling pour une présentation PowerPoint.\nTu poses des questions courtes et percutantes pour creuser le sujet.\n${templateContext}\n\nRègles:\n1. Réponds UNIQUEMENT avec un objet JSON : { "questions": ["Question 1?", "Question 2?", ...] }\n2. Pose exactement 4 questions maximum.\n3. Les questions doivent être ouvertes et aider à structurer la présentation.\n4. VARIE les thèmes des questions — ne pose pas deux questions sur le même aspect. Passe en revue différents skills du persona.\n5. Les questions doivent être complémentaires et couvrir des angles différents.\n6. Ne mets pas de markdown dans le JSON.`,
    },
    {
      role: "user",
      content: `Je veux créer une présentation sur ce sujet :\n\n"""\n${subject}\n"""\n\nPose-moi des questions pour m'aider à construire le storytelling. Réponds uniquement avec le JSON demandé.`,
    },
  ];
}

export function buildInterviewStorytellingPrompt(
  subject: string,
  questions: string[],
  answers: string[],
  persona: InterviewPersona,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}). Adapte le ton à ce style.`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en storytelling et création de présentations PowerPoint professionnelles.";

  const personaPrompt = persona.prompt
    ? `\n\nPersona adopté pour la rédaction : ${persona.name}.\n${persona.prompt}\n`
    : "";

  const qaPairs = questions
    .map((q, i) => `Q: ${q}\nA: ${answers[i] || ""}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `${systemPrompt}${personaPrompt}\n\nTu rédiges un storytelling structuré pour une présentation PowerPoint, à partir d'un sujet et de réponses à des questions.\n${templateContext}\n\nRègles:\n1. Le storytelling doit être structuré en sections claires (Introduction, Développement, Conclusion).\n2. Chaque section doit contenir des idées clés sous forme de phrases concises.\n3. Le ton doit être professionnel et impactant.\n4. N'utilise pas de markdown (pas de **, pas de #).\n5. Le texte doit pouvoir être découpé en 3 à 8 slides.`,
    },
    {
      role: "user",
      content: `Sujet : ${subject}\n\n${qaPairs}\n\nRédige un storytelling structuré pour une présentation PowerPoint à partir de ces éléments.`,
    },
  ];
}

// ─── Brainstorming Prompts ───────────────────────────────────────────────────

export interface BrainstormPersona {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export function buildBrainstormingPrompt(
  subject: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  persona: BrainstormPersona,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}). Adapte le ton à ce style.`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en storytelling et création de présentations.";

  const personaPrompt = persona.prompt || `Tu adaptes ton style selon le sujet "${subject}".`;

  const history = messages
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\n${personaPrompt}\n${templateContext}\n\nTu participes à une session de brainstorming pour construire un storytelling de présentation.\n\nRègles:\n1. Tu réponds sous forme de conversation naturelle, comme si tu discutais avec l'utilisateur.\n2. Après chaque échange, tu produis également une version mise à jour du storytelling structuré.\n3. Réponds UNIQUEMENT avec un objet JSON : { "reply": "ta réponse conversationnelle", "storytelling": "le storytelling structuré mis à jour" }\n4. Le storytelling doit être structuré en sections (Introduction, Développement, Conclusion) avec des phrases concises.\n5. N'utilise pas de markdown dans le JSON.\n6. Sois constructif, challenge les idées faibles, et propose des améliorations concrètes.`,
    },
    {
      role: "user",
      content: `Sujet de la présentation : ${subject}\n\n${history ? `Historique de la conversation :\n${history}\n\n` : ""}Continue la session de brainstorming.`,
    },
  ];
}

// ─── Story Chat (StoryPanel) ─────────────────────────────────────────────────

export interface StoryChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StoryChatPersona {
  name: string;
  description: string;
}

export interface StoryChatSlideContext {
  index: number;
  title: string;
  content: string;
  layout: string;
}

export interface StoryChatResult {
  reply: string;
  storytelling?: string;
  slide?: { title: string; content: string; layout: string };
}

/**
 * Builds a real multi-turn chat prompt: the full conversation is sent as
 * distinct user/assistant messages so the model always sees the answers
 * already given and never re-asks a question.
 */
export function buildStoryChatPrompt(
  history: StoryChatMessage[],
  persona: StoryChatPersona,
  mode: "interview" | "brainstorm",
  config: LlmConfig,
  template?: Template,
  slideContext?: StoryChatSlideContext | null
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}). Adapte le ton à ce style.`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en storytelling et création de présentations PowerPoint professionnels.";

  const modeRules =
    mode === "brainstorm"
      ? "Mode Brainstorm : tu co-construis le storytelling avec l'utilisateur. Challenge les idées faibles, propose des améliorations concrètes, et fais évoluer le storytelling à chaque échange."
      : "Mode Interview : tu conduis une interview structurée. Couvre progressivement l'objectif, le public cible, les points clés, puis les contraintes de temps et de format. Quand tu as assez d'informations (après 4 à 6 réponses), livre le storytelling structuré et arrête de questionner.";

  const slideRules = slideContext
    ? `\n\nFocus slide activé : l'utilisateur travaille sur la slide ${slideContext.index + 1} (titre: "${slideContext.title}", contenu: "${slideContext.content}", layout: ${slideContext.layout}). Quand sa demande concerne cette slide, renseigne le champ "slide" avec la version mise à jour de CETTE slide uniquement. Sinon, omets le champ "slide".`
    : "";

  const turns: LlmMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu es "${persona.name}" — ${persona.description}.\n\nTu discutes avec l'utilisateur pour construire le storytelling de sa présentation.\n${modeRules}${slideRules}${templateContext}\n\nRègles STRICTES de conversation :\n1. Chaque réponse de l'utilisateur est une information acquise : intègre-la et ne la redemande jamais.\n2. Commence par accuser brièvement réception de la dernière réponse de l'utilisateur (une phrase courte) avant de poursuivre.\n3. NE POSE JAMAIS une question dont la réponse figure déjà dans l'historique. Si un sujet est couvert, passe au suivant.\n4. Pose AU MAXIMUM UNE seule question courte par message, jamais deux.\n5. Dès que tu as assez d'éléments, renseigne le champ "storytelling" avec le storytelling structuré (Introduction, Développement, Conclusion) et arrête de questionner.\n6. Réponds UNIQUEMENT avec un objet JSON : { "reply": "...", "storytelling": "..." (optionnel), "slide": { "title": "...", "content": "...", "layout": "..." } (optionnel) }.\n7. Pas de markdown dans le JSON. Le JSON doit être directement parsable.`,
    },
    ...turns,
  ];
}

/**
 * Parses a story chat response. Handles strict JSON (optionally inside a
 * markdown code block) and falls back to plain text with an optional
 * "Storytelling:" section.
 */
export function parseStoryChatResponse(raw: string): StoryChatResult {
  const trimmed = raw.trim();

  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  if (!jsonStr.startsWith("{")) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = trimmed.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      const result: StoryChatResult = {
        reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
      };
      if (typeof parsed.storytelling === "string" && parsed.storytelling.trim()) {
        result.storytelling = parsed.storytelling.trim();
      }
      const slide = parsed.slide as Record<string, unknown> | undefined;
      if (slide && typeof slide === "object") {
        result.slide = {
          title: String(slide.title ?? ""),
          content: String(slide.content ?? ""),
          layout: String(slide.layout ?? "title-content"),
        };
      }
      if (!result.reply) {
        result.reply =
          trimmed.replace(jsonStr, "").trim() ||
          (result.storytelling || result.slide ? "C'est noté, je mets à jour." : trimmed);
      }
      return result;
    }
  } catch {
    // Not JSON — plain text fallback below.
  }

  let reply = trimmed;
  let storytelling: string | undefined;
  // The marker must start a line and require the colon, so the word
  // "storytelling" used mid-sentence is never mistaken for a section label.
  const storytellingMatch = trimmed.match(
    /(?:^|\n)[ \t]*(?:Storytelling|STORYTELLING|Récit)[ \t]*:[ \t]*([\s\S]*?)(?=\n\n|$)/i
  );
  if (storytellingMatch && typeof storytellingMatch.index === "number") {
    storytelling = storytellingMatch[1].trim();
    reply = (
      trimmed.slice(0, storytellingMatch.index) +
      trimmed.slice(storytellingMatch.index + storytellingMatch[0].length)
    )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const result: StoryChatResult = { reply };
  if (storytelling) result.storytelling = storytelling;
  return result;
}

// ─── Deck Edit (incremental chat editing) ───────────────────────────────────

export interface DeckSlideContext {
  index: number;
  title: string;
  content: string;
  layout: string;
}

export interface DeckContext {
  title: string;
  slides: DeckSlideContext[];
  storytelling?: string;
}

export interface DeckEditResult {
  reply: string;
  operations: DeckOperation[];
}

/** Layouts offered to the model when it edits the deck. */
const EDITABLE_LAYOUTS = [
  "title",
  "title-content",
  "two-column",
  "title-only",
  "content-only",
  "image-left",
  "image-right",
  "timeline",
  "gantt",
  "mermaid",
  "excalidraw",
  "roadmap",
  "architecture",
];

const MAX_CONTEXT_SLIDE_CHARS = 600;
const MAX_CONTEXT_STORY_CHARS = 2000;

function describeSlideForEditing(slide: DeckSlideContext): string {
  const flat = String(slide.content ?? "").replace(/\s+/g, " ").trim();
  const content =
    flat.length > MAX_CONTEXT_SLIDE_CHARS ? `${flat.slice(0, MAX_CONTEXT_SLIDE_CHARS)}…` : flat;
  return `[${slide.index}] (${slide.layout || "title-content"}) ${slide.title || "Sans titre"} — ${
    content || "(contenu vide)"
  }`;
}

/**
 * Prompt for the "Édition" chat: the model edits the EXISTING deck by returning
 * a plan of operations. It never regenerates the presentation — that is the
 * whole point of this prompt (a full regeneration wipes the user's slides).
 */
export function buildDeckEditPrompt(
  history: StoryChatMessage[],
  deck: DeckContext,
  persona: StoryChatPersona,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}). Adapte le ton à ce style.`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en storytelling et création de présentations PowerPoint professionnels.";

  const slidesList = deck.slides.length
    ? deck.slides.map(describeSlideForEditing).join("\n")
    : "(aucune slide pour le moment)";

  const story = (deck.storytelling || "").trim();
  const storyContext = story
    ? `\n\nStorytelling de référence (contexte, ne le réécris pas) :\n"""\n${
        story.length > MAX_CONTEXT_STORY_CHARS ? story.slice(0, MAX_CONTEXT_STORY_CHARS) : story
      }\n"""`
    : "";

  const turns: LlmMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu es "${persona.name}" — ${persona.description}.\n\nTu MODIFIES une présentation PowerPoint qui existe déjà, en discutant avec l'utilisateur. Tu ne repars jamais de zéro.\n${templateContext}\n\nPrésentation actuelle : "${deck.title}" — ${deck.slides.length} slide(s).\n${slidesList}${storyContext}\n\nRègles ABSOLUES :\n1. Tu ne régénères JAMAIS la présentation entière et tu ne renvoies jamais la liste complète des slides.\n2. Tu renvoies uniquement un plan d'opérations sur les slides existantes listées ci-dessus.\n3. Les slides que l'utilisateur ne mentionne pas restent IDENTIQUES, au caractère près.\n4. Pour "ajoute une slide sur …", tu renvoies une seule opération "add" avec la slide complète (title, content, layout).\n5. Si la demande est ambiguë ou ne concerne pas les slides, tu renvoies "operations": [] et tu poses UNE seule question courte dans "reply".\n6. Maximum 3 opérations par message ; au-delà, propose de découper et renvoie "operations": [].\n\nFormat de réponse — UNIQUEMENT cet objet JSON, rien avant, rien après :\n{"reply": "ta réponse en une ou deux phrases", "operations": [ ... ]}\n\nOpérations autorisées (index 0-based, ceux de la liste ci-dessus) :\n- {"op":"add","afterIndex":<index après lequel insérer, optionnel : à la fin par défaut>,"slide":{"title":"...","content":"...","layout":"..."}}\n- {"op":"update","index":<index>,"slide":{"title":"...","content":"...","layout":"..."}} — seuls les champs modifiés sont nécessaires\n- {"op":"delete","index":<index>}\n- {"op":"move","fromIndex":<index>,"toIndex":<index>}\n\nLayouts autorisés : ${EDITABLE_LAYOUTS.join(", ")}.\nFormats de contenu : "two-column" sépare les deux colonnes par "|" ; "timeline" une ligne par événement "YYYY-MM-DD - Titre - Description optionnelle" ; "gantt" une ligne par tâche "Nom | YYYY-MM-DD | YYYY-MM-DD | #couleur optionnelle" ; "mermaid" du code Mermaid valide.\nPas de markdown dans le JSON. Le JSON doit être directement parsable.`,
    },
    ...turns,
  ];
}

function extractJsonPayload(raw: string): string | null {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  if (trimmed.startsWith("{")) return trimmed;
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }
  return null;
}

function readSlidePayload(value: unknown): DeckSlidePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const payload: DeckSlidePayload = {};
  if (typeof raw.title === "string") payload.title = raw.title;
  if (typeof raw.content === "string") payload.content = raw.content;
  if (typeof raw.layout === "string" && raw.layout.trim()) {
    // Models often write "Two Column" or "two_column": normalize the separator
    // before validating, so the layout is not silently downgraded.
    payload.layout = normalizeLayout(raw.layout.replace(/[\s_]+/g, "-"));
  }
  if (
    payload.title === undefined &&
    payload.content === undefined &&
    payload.layout === undefined
  ) {
    return null;
  }
  return payload;
}

function readIndex(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Validates the operations coming from the model; anything unusable is dropped. */
export function parseDeckOperations(value: unknown): DeckOperation[] {
  if (!Array.isArray(value)) return [];
  const operations: DeckOperation[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const op = typeof raw.op === "string" ? raw.op.toLowerCase() : "";

    if (op === "add") {
      const slide = readSlidePayload(raw.slide) ?? {};
      if (slide.title === undefined && slide.content === undefined) continue;
      const afterIndex = readIndex(raw.afterIndex);
      operations.push(
        afterIndex === null ? { op: "add", slide } : { op: "add", afterIndex, slide }
      );
      continue;
    }

    if (op === "update") {
      const index = readIndex(raw.index);
      const slide = readSlidePayload(raw.slide);
      if (index === null || !slide) continue;
      operations.push({ op: "update", index, slide });
      continue;
    }

    if (op === "delete" || op === "remove") {
      const index = readIndex(raw.index);
      if (index === null) continue;
      operations.push({ op: "delete", index });
      continue;
    }

    if (op === "move" || op === "reorder") {
      const fromIndex = readIndex(raw.fromIndex ?? raw.index);
      const toIndex = readIndex(raw.toIndex);
      if (fromIndex === null || toIndex === null) continue;
      operations.push({ op: "move", fromIndex, toIndex });
    }
  }

  return operations;
}

export function parseDeckEditResponse(raw: string): DeckEditResult {
  const trimmed = (raw || "").trim();
  const jsonStr = extractJsonPayload(trimmed);

  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const operations = parseDeckOperations(parsed.operations);
        const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
        return {
          reply:
            reply ||
            (operations.length
              ? "C'est noté, je mets à jour la présentation."
              : trimmed.replace(jsonStr, "").trim()),
          operations,
        };
      }
    } catch {
      // Not JSON — plain text fallback below.
    }
  }

  return { reply: trimmed, operations: [] };
}

// ─── Mermaid Prompt ────────────────────────────────────────────────────────

export function buildMermaidPrompt(
  description: string,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}).`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en diagrammes et visualisation de données.";

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu génères du code Mermaid à partir d'une description textuelle.\n${templateContext}\n\nRègles:\n1. Réponds UNIQUEMENT avec du code Mermaid valide (pas d'explications, pas de markdown autour).\n2. Utilise les types de diagrammes appropriés : flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, mindmap, pie, gantt, etc.\n3. Le code doit être propre, bien structuré et utiliser des noms clairs.\n4. Pour les flowcharts, utilise TD (top-down) ou LR (left-right) selon la complexité.\n5. Pour les séquences, définis les participants explicitement.\n6. Pour les class diagrams, montre les relations et les attributs principaux.\n7. Ne mets pas de blocs de code markdown (pas de \`\`\`mermaid).\n8. Assure-toi que la syntaxe Mermaid est valide.`,
    },
    {
      role: "user",
      content: `Génère un diagramme Mermaid à partir de cette description :\n\n${description}\n\nRéponds uniquement avec le code Mermaid.`,
    },
  ];
}

export function buildMermaidEvolvePrompt(
  currentCode: string,
  instruction: string,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}).`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en diagrammes et visualisation de données.";

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu modifies du code Mermaid existant selon les instructions fournies.\n${templateContext}\n\nRègles:\n1. Réponds UNIQUEMENT avec le code Mermaid mis à jour (pas d'explications, pas de markdown autour).\n2. Garde la structure et le type de diagramme du code original sauf si l'instruction demande explicitement de changer.\n3. Applique TOUTES les modifications demandées dans l'instruction.\n4. Ne mets pas de blocs de code markdown (pas de \`\`\`mermaid).\n5. Assure-toi que la syntaxe Mermaid reste valide.`,
    },
    {
      role: "user",
      content: `Code Mermaid actuel :\n\n${currentCode}\n\nInstructions de modification :\n${instruction}\n\nRéponds uniquement avec le code Mermaid modifié.`,
    },
  ];
}

export function buildMermaidChatPrompt(
  currentCode: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}).`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en diagrammes et visualisation de données.";

  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const lastMessage = messages[messages.length - 1];

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu participes à une conversation pour concevoir et faire évoluer un diagramme Mermaid.\n${templateContext}\n\nRègles:\n1. Réponds UNIQUEMENT avec un objet JSON : { "reply": "ta réponse conversationnelle", "code": "le code Mermaid mis à jour" }\n2. Le champ 'reply' doit contenir une réponse naturelle et utile à l'utilisateur.\n3. Le champ 'code' doit contenir le code Mermaid complet et valide.\n4. Si l'utilisateur ne demande pas de modification du schéma, garde le code actuel inchangé dans le champ 'code'.\n5. N'utilise pas de markdown dans le JSON.\n6. Assure-toi que la syntaxe Mermaid est valide.`,
    },
    {
      role: "user",
      content: `Code Mermaid actuel :\n\n${currentCode}\n\n${history ? `Historique de la conversation :\n${history}\n\n` : ""}Nouveau message :\n${lastMessage?.content || ""}\n\nRéponds avec le JSON demandé.`,
    },
  ];
}

// ─── Excalidraw Prompts ─────────────────────────────────────────────────────

export function buildExcalidrawPrompt(
  description: string,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}).`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en diagrammes et visualisation de données.";

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu génères des diagrammes Excalidraw à partir d'une description textuelle. Excalidraw est un outil de dessin à main levée.\n${templateContext}\n\nRègles:\n1. Réponds UNIQUEMENT avec un objet JSON : { "reply": "ta réponse", "elements": [...] }\n2. Le champ 'reply' doit contenir une réponse conversationnelle.\n3. Le champ 'elements' est un tableau d'éléments graphiques simplifiés.\n4. Chaque élément a : type (rectangle|ellipse|diamond|text|arrow|line), x, y, width, height, et optionnellement text, strokeColor, backgroundColor.\n5. Pour les flèches : ajoute startX, startY, endX, endY.\n6. Coordonnées : canvas de 800x600. Positionne les éléments de manière espacée (minimum 50px entre eux).\n7. Utilise des couleurs de fond pastel (ex: #e3f2fd, #fce4ec, #f3e5f5, #e8f5e9) pour différencier les zones.\n8. N'utilise pas de markdown dans le JSON.\n9. Assure-toi que le JSON est valide.`,
    },
    {
      role: "user",
      content: `Génère un diagramme Excalidraw à partir de cette description :\n\n${description}\n\nRéponds avec le JSON demandé.`,
    },
  ];
}

export function buildExcalidrawChatPrompt(
  currentElements: any[],
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: LlmConfig,
  template?: Template
): LlmMessage[] {
  const templateContext = template
    ? `Le design suit le template "${template.name}" (${template.description}).`
    : "";

  const systemPrompt =
    config.systemPrompt ||
    "Tu es un expert en diagrammes et visualisation de données.";

  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const lastMessage = messages[messages.length - 1];
  const elementsSummary = currentElements.map((el) =>
    `- ${el.type} at (${el.x},${el.y}) size ${el.width}x${el.height}${el.text ? ` text:"${el.text}"` : ""}`
  ).join("\n");

  return [
    {
      role: "system",
      content: `${systemPrompt}\n\nTu participes à une conversation pour concevoir et faire évoluer un diagramme Excalidraw (dessin à main levée).\n${templateContext}\n\nRègles:\n1. Réponds UNIQUEMENT avec un objet JSON : { "reply": "ta réponse conversationnelle", "elements": [...] }\n2. Le champ 'reply' doit contenir une réponse naturelle et utile.\n3. Le champ 'elements' est un tableau d'éléments graphiques simplifiés qui REMPLACE complètement les éléments actuels.\n4. Chaque élément a : type (rectangle|ellipse|diamond|text|arrow|line), x, y, width, height, et optionnellement text, strokeColor, backgroundColor.\n5. Pour les flèches : ajoute startX, startY, endX, endY.\n6. Canvas de 800x600. Espacement minimum 50px.\n7. Utilise des couleurs de fond pastel.\n8. N'utilise pas de markdown dans le JSON.`,
    },
    {
      role: "user",
      content: `Éléments actuels :\n${elementsSummary || "(aucun)"}\n\n${history ? `Historique :\n${history}\n\n` : ""}Nouveau message :\n${lastMessage?.content || ""}\n\nRéponds avec le JSON demandé.`,
    },
  ];
}
