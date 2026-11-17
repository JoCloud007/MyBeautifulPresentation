import { describe, it, expect } from "vitest";
import { buildDeckEditPrompt, parseDeckEditResponse } from "@/lib/llm";
import type { LlmConfig } from "@/app/types/llm";

const dummyConfig: LlmConfig = {
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  model: "llama3.2",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "",
};

const persona = { name: "Consultant", description: "Questions structurées" };

const deck = {
  title: "Stratégie Cloud",
  storytelling: "Introduction\nDéveloppement\nConclusion",
  slides: [
    { index: 0, title: "Stratégie Cloud", content: "Migrer 80% des workloads", layout: "title" },
    { index: 1, title: "Le Défi", content: "• Legacy\n• Coûts", layout: "title-content" },
  ],
};

function systemContent(messages: ReturnType<typeof buildDeckEditPrompt>): string {
  return messages[0].content;
}

describe("buildDeckEditPrompt", () => {
  it("envoie le deck existant au modèle (index, titres, contenus)", () => {
    const messages = buildDeckEditPrompt([], deck, persona, dummyConfig);
    const system = systemContent(messages);

    expect(messages[0].role).toBe("system");
    expect(system).toContain("Stratégie Cloud");
    expect(system).toContain("[0]");
    expect(system).toContain("[1]");
    expect(system).toContain("Le Défi");
    expect(system).toContain("Migrer 80% des workloads");
  });

  it("interdit explicitement la régénération complète", () => {
    const system = systemContent(buildDeckEditPrompt([], deck, persona, dummyConfig));

    expect(system).toMatch(/ne régénères JAMAIS la présentation entière/i);
    expect(system).toMatch(/restent IDENTIQUES/i);
  });

  it("décrit les opérations autorisées", () => {
    const system = systemContent(buildDeckEditPrompt([], deck, persona, dummyConfig));

    expect(system).toContain('"op":"add"');
    expect(system).toContain('"op":"update"');
    expect(system).toContain('"op":"delete"');
    expect(system).toContain('"operations"');
  });

  it("transmet l'historique de conversation à la suite du message système", () => {
    const messages = buildDeckEditPrompt(
      [
        { role: "user", content: "rajoute une slide sur les risques" },
        { role: "assistant", content: "Quel angle pour les risques ?" },
      ],
      deck,
      persona,
      dummyConfig
    );

    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ role: "user", content: "rajoute une slide sur les risques" });
    expect(messages[2]).toEqual({ role: "assistant", content: "Quel angle pour les risques ?" });
  });

  it("inclut le storytelling de référence quand il existe", () => {
    const system = systemContent(buildDeckEditPrompt([], deck, persona, dummyConfig));
    expect(system).toContain("Introduction");
  });

  it("gère un deck vide sans casser le prompt", () => {
    const messages = buildDeckEditPrompt(
      [{ role: "user", content: "ajoute une slide" }],
      { title: "Nouvelle", slides: [] },
      persona,
      dummyConfig
    );

    expect(systemContent(messages)).toContain("aucune slide");
    expect(messages).toHaveLength(2);
  });
});

describe("parseDeckEditResponse", () => {
  it("lit un JSON strict avec opérations", () => {
    const raw = JSON.stringify({
      reply: "J'ajoute une slide sur les risques.",
      operations: [
        { op: "add", slide: { title: "Risques", content: "• Conformité", layout: "title-content" } },
      ],
    });

    const result = parseDeckEditResponse(raw);

    expect(result.reply).toBe("J'ajoute une slide sur les risques.");
    expect(result.operations).toEqual([
      { op: "add", slide: { title: "Risques", content: "• Conformité", layout: "title-content" } },
    ]);
  });

  it("lit un JSON dans un bloc de code markdown", () => {
    const raw = '```json\n{"reply":"OK","operations":[{"op":"delete","index":1}]}\n```';

    const result = parseDeckEditResponse(raw);

    expect(result.reply).toBe("OK");
    expect(result.operations).toEqual([{ op: "delete", index: 1 }]);
  });

  it("normalise un layout inconnu", () => {
    const raw = JSON.stringify({
      reply: "ok",
      operations: [{ op: "add", slide: { title: "X", layout: "TWO COLUMN" } }],
    });

    const result = parseDeckEditResponse(raw);

    expect(result.operations[0]).toMatchObject({ op: "add" });
    const operation = result.operations[0];
    expect(operation.op === "add" && operation.slide.layout).toBe("two-column");
  });

  it("écarte les opérations inutilisables", () => {
    const raw = JSON.stringify({
      reply: "partiel",
      operations: [
        { op: "update", index: -1, slide: { title: "Nope" } },
        { op: "delete", index: "abc" },
        { op: "explode", index: 0 },
        { op: "add" },
        { op: "move", fromIndex: 0 },
        { op: "update", index: 2, slide: { content: "Ok" } },
      ],
    });

    const result = parseDeckEditResponse(raw);

    expect(result.operations).toEqual([{ op: "update", index: 2, slide: { content: "Ok" } }]);
  });

  it("n'interprète jamais une liste complète de slides comme un remplacement", () => {
    const raw = JSON.stringify({
      reply: "Voici la présentation complète.",
      title: "Autre présentation",
      slides: [
        { title: "A", content: "a", layout: "title" },
        { title: "B", content: "b", layout: "title-content" },
      ],
    });

    const result = parseDeckEditResponse(raw);

    expect(result.operations).toEqual([]);
    expect(result.reply).toBe("Voici la présentation complète.");
  });

  it("retombe sur le texte brut quand la réponse n'est pas du JSON", () => {
    const result = parseDeckEditResponse("Quelle slide veux-tu ajouter ?");

    expect(result.reply).toBe("Quelle slide veux-tu ajouter ?");
    expect(result.operations).toEqual([]);
  });

  it("fournit une réponse par défaut quand le modèle n'écrit que des opérations", () => {
    const raw = JSON.stringify({ operations: [{ op: "delete", index: 0 }] });

    const result = parseDeckEditResponse(raw);

    expect(result.reply).toBe("C'est noté, je mets à jour la présentation.");
    expect(result.operations).toHaveLength(1);
  });
});
