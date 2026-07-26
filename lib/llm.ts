import { LlmConfig, LlmMessage, OllamaChatRequest, OllamaResponse } from "@/app/types/llm";
import { Template } from "@/app/types/template";

export async function checkOllamaAvailability(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`/api/ollama?baseUrl=${encodeURIComponent(baseUrl)}`, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`/api/ollama?baseUrl=${encodeURIComponent(baseUrl)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function* streamOllamaChat(
  config: LlmConfig,
  messages: LlmMessage[],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const body: OllamaChatRequest = {
    model: config.model,
    messages,
    stream: true,
    options: {
      temperature: config.temperature,
      num_predict: config.maxTokens,
    },
  };

  const res = await fetch("/api/ollama", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      ...body,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
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
    try {
      const chunk: OllamaResponse = JSON.parse(buffer.trim());
      if (chunk.message?.content) {
        yield chunk.message.content;
      }
    } catch {
      // ignore malformed JSON
    }
  }
}

export async function callOllamaChat(
  config: LlmConfig,
  messages: LlmMessage[]
): Promise<string> {
  const body: OllamaChatRequest = {
    model: config.model,
    messages,
    stream: false,
    options: {
      temperature: config.temperature,
      num_predict: config.maxTokens,
    },
  };

  const res = await fetch("/api/ollama", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      ...body,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }

  const data: OllamaResponse = await res.json();
  return data.message?.content || "";
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

  return [
    {
      role: "system",
      content:
        `${baseSystemPrompt}\n\nRègles STRICTES :\n1. Réponds UNIQUEMENT avec un objet JSON valide contenant 'title' (string) et 'slides' (array).\n2. Chaque slide doit avoir : title (string), content (string), layout (string parmi : title, title-content, two-column, title-only, content-only, image-left, image-right).\n3. Maximum 8 slides.\n4. Le titre de la présentation doit être accrocheur et professionnel.\n5. Le contenu de chaque slide doit être concis (idéalement 3-5 points clés ou 2-3 phrases percutantes).\n6. Pour la mise en page 'two-column', utilise le caractère '|' dans le content pour séparer les deux colonnes.\n7. Ne mets pas de markdown dans le JSON (pas de **, pas de #, etc.).\n8. Le JSON doit être directement parsable, sans texte avant ou après.${templateContext}`,
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
export function normalizeLayout(layout: string): string {
  const validLayouts = [
    "title",
    "title-content",
    "two-column",
    "title-only",
    "content-only",
    "image-left",
    "image-right",
  ];
  const normalized = String(layout).toLowerCase().trim();
  return validLayouts.includes(normalized) ? normalized : "title-content";
}
