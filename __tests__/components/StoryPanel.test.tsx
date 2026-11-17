import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoryPanel } from "@/app/components/layout/StoryPanel";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useLlmStore } from "@/app/stores/llmStore";
import { callLlmChat, streamLlmChat } from "@/lib/llm";

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    callLlmChat: vi.fn(),
    streamLlmChat: vi.fn(),
  };
});

const mockCallLlmChat = vi.mocked(callLlmChat);
const mockStreamLlmChat = vi.mocked(streamLlmChat);

describe("StoryPanel — conversation LLM réelle (anti-boucle de questions)", () => {
  beforeEach(() => {
    mockCallLlmChat.mockReset();
    mockStreamLlmChat.mockReset();
    usePresentationStore.setState({
      presentation: {
        id: "pres-1",
        title: "Test",
        slides: [
          {
            id: "s1",
            title: "Titre initial",
            content: "Contenu initial",
            layout: "title-content",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
    });
    useLlmStore.setState({
      config: {
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama3.2",
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: "",
      },
      isAvailable: true,
      availableModels: [],
      isCheckingConnection: false,
      lastError: null,
    });
  });

  it("envoie l'historique complet des réponses au LLM", async () => {
    mockCallLlmChat
      .mockResolvedValueOnce(JSON.stringify({ reply: "Quel est le public cible ?" }))
      .mockResolvedValueOnce(JSON.stringify({ reply: "Très bien, quel est l'objectif chiffré ?" }));

    render(<StoryPanel />);
    fireEvent.click(screen.getByText("Interview"));

    fireEvent.change(screen.getByPlaceholderText("Votre réponse..."), {
      target: { value: "Une présentation de 5 pages sur Debian" },
    });
    fireEvent.click(screen.getByText("Envoyer"));

    await waitFor(() => expect(mockCallLlmChat).toHaveBeenCalledTimes(1));
    await screen.findByText("Quel est le public cible ?");

    fireEvent.change(screen.getByPlaceholderText("Votre réponse..."), {
      target: { value: "Des IT managers" },
    });
    fireEvent.click(screen.getByText("Envoyer"));

    await waitFor(() => expect(mockCallLlmChat).toHaveBeenCalledTimes(2));

    const secondCallMessages = mockCallLlmChat.mock.calls[1][1];
    const userContents = secondCallMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    expect(userContents).toContain("Une présentation de 5 pages sur Debian");
    expect(userContents).toContain("Des IT managers");

    const assistantContents = secondCallMessages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content);
    expect(assistantContents).toContain("Quel est le public cible ?");
  });

  it("n'utilise jamais les phrases aléatoires embarquées (plus de stub setTimeout)", async () => {
    mockCallLlmChat.mockResolvedValue(JSON.stringify({ reply: "Réponse unique du LLM." }));

    render(<StoryPanel />);
    fireEvent.click(screen.getByText("Brainstorm"));

    fireEvent.change(screen.getByPlaceholderText("Votre réponse..."), {
      target: { value: "Un sujet de test" },
    });
    fireEvent.click(screen.getByText("Envoyer"));

    await screen.findByText("Réponse unique du LLM.");
    expect(screen.queryByText("Très bien. Quel est le public cible de cette présentation ?")).toBeNull();
  });

  it("synchronise le storytelling retourné dans le store", async () => {
    mockCallLlmChat.mockResolvedValue(
      JSON.stringify({ reply: "Voici le storytelling.", storytelling: "Introduction\nDéveloppement\nConclusion" })
    );

    render(<StoryPanel />);
    fireEvent.click(screen.getByText("Brainstorm"));

    fireEvent.change(screen.getByPlaceholderText("Votre réponse..."), {
      target: { value: "Un sujet de test" },
    });
    fireEvent.click(screen.getByText("Envoyer"));

    await waitFor(() =>
      expect(usePresentationStore.getState().storytelling).toBe("Introduction\nDéveloppement\nConclusion")
    );
    await screen.findByText("Storytelling en cours");
  });

  it("applique la mise à jour de slide quand le focus slide est actif", async () => {
    mockCallLlmChat.mockResolvedValue(
      JSON.stringify({
        reply: "Slide mise à jour.",
        slide: { title: "Nouveau titre", content: "Nouveau contenu", layout: "two-column" },
      })
    );

    render(<StoryPanel />);
    fireEvent.click(screen.getByText("Brainstorm"));
    fireEvent.click(screen.getByText("Focus slide OFF"));

    fireEvent.change(screen.getByPlaceholderText("Modifie la slide 1..."), {
      target: { value: "Rends la slide plus claire" },
    });
    fireEvent.click(screen.getByText("Envoyer"));

    await waitFor(() => {
      const slide = usePresentationStore.getState().presentation?.slides?.[0];
      expect(slide?.title).toBe("Nouveau titre");
      expect(slide?.content).toBe("Nouveau contenu");
      expect(slide?.layout).toBe("two-column");
    });
  });

  it("affiche l'erreur LLM sans casser la conversation", async () => {
    mockCallLlmChat.mockRejectedValue(new Error("LLM error: 500 boom"));

    render(<StoryPanel />);
    fireEvent.click(screen.getByText("Interview"));

    fireEvent.change(screen.getByPlaceholderText("Votre réponse..."), {
      target: { value: "Une réponse" },
    });
    fireEvent.click(screen.getByText("Envoyer"));

    await screen.findByText("LLM error: 500 boom");
  });

  describe("mode Édition — modification incrémentale du deck", () => {
    it("ajoute une slide sans régénérer la présentation", async () => {
      const initialId = usePresentationStore.getState().presentation?.id;
      mockCallLlmChat.mockResolvedValue(
        JSON.stringify({
          reply: "J'ajoute une slide sur les risques.",
          operations: [
            {
              op: "add",
              slide: {
                title: "Risques",
                content: "• Conformité réglementaire",
                layout: "title-content",
              },
            },
          ],
        })
      );

      render(<StoryPanel />);
      fireEvent.click(screen.getByText("Édition"));

      fireEvent.change(
        screen.getByPlaceholderText("Ex : rajoute une slide sur les risques..."),
        { target: { value: "rajoute une slide pour montrer les risques" } }
      );
      fireEvent.click(screen.getByText("Envoyer"));

      await screen.findByText("J'ajoute une slide sur les risques.");

      const state = usePresentationStore.getState();
      expect(state.presentation?.id).toBe(initialId);
      expect(state.presentation?.slides).toHaveLength(2);
      expect(state.presentation?.slides[0].title).toBe("Titre initial");
      expect(state.presentation?.slides[0].content).toBe("Contenu initial");
      expect(state.presentation?.slides[1].title).toBe("Risques");
      expect(state.currentSlideIndex).toBe(1);
    });

    it("affiche le récapitulatif des opérations appliquées", async () => {
      mockCallLlmChat.mockResolvedValue(
        JSON.stringify({
          reply: "C'est ajouté.",
          operations: [{ op: "add", slide: { title: "Risques", layout: "title-content" } }],
        })
      );

      render(<StoryPanel />);
      fireEvent.click(screen.getByText("Édition"));
      fireEvent.change(
        screen.getByPlaceholderText("Ex : rajoute une slide sur les risques..."),
        { target: { value: "ajoute une slide sur les risques" } }
      );
      fireEvent.click(screen.getByText("Envoyer"));

      await screen.findByText("✓ + slide « Risques »");
    });

    it("n'écrase pas le deck quand le modèle renvoie une présentation complète", async () => {
      const initialId = usePresentationStore.getState().presentation?.id;
      mockCallLlmChat.mockResolvedValue(
        JSON.stringify({
          reply: "Voici la présentation complète.",
          title: "Nouvelle présentation",
          slides: [
            { title: "A", content: "a", layout: "title" },
            { title: "B", content: "b", layout: "title-content" },
          ],
        })
      );

      render(<StoryPanel />);
      fireEvent.click(screen.getByText("Édition"));
      fireEvent.change(
        screen.getByPlaceholderText("Ex : rajoute une slide sur les risques..."),
        { target: { value: "refais toute la présentation" } }
      );
      fireEvent.click(screen.getByText("Envoyer"));

      await screen.findByText("Voici la présentation complète.");

      const state = usePresentationStore.getState();
      expect(state.presentation?.id).toBe(initialId);
      expect(state.presentation?.title).toBe("Test");
      expect(state.presentation?.slides).toHaveLength(1);
      expect(state.presentation?.slides[0].title).toBe("Titre initial");
    });
  });

  it("demande confirmation avant de remplacer un deck existant en mode Direct", async () => {
    render(<StoryPanel />);

    fireEvent.change(
      screen.getByPlaceholderText(
        "Ex: Une présentation de 5 slides sur notre stratégie cloud pour 2025..."
      ),
      { target: { value: "Une nouvelle histoire" } }
    );
    fireEvent.click(screen.getByText("Régénérer la présentation"));

    await screen.findByText("Remplacer la présentation");
    expect(mockStreamLlmChat).not.toHaveBeenCalled();
    expect(usePresentationStore.getState().presentation?.slides[0].title).toBe("Titre initial");

    fireEvent.click(screen.getByText("Annuler"));
    expect(screen.queryByText("Remplacer la présentation")).toBeNull();
  });
});
