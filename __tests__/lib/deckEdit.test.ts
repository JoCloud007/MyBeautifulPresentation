import { describe, it, expect } from "vitest";
import { applyDeckOperations } from "@/lib/deckEdit";
import type { Slide } from "@/app/types/presentation";

function makeSlide(
  id: string,
  title: string,
  content = "",
  layout: Slide["layout"] = "title-content"
): Slide {
  return { id, title, content, layout };
}

function makeDeck(): Slide[] {
  return [
    makeSlide("s1", "Intro"),
    makeSlide("s2", "Le Défi"),
    makeSlide("s3", "Solution"),
  ];
}

describe("applyDeckOperations", () => {
  it("ajoute une slide à la fin quand afterIndex est absent", () => {
    const deck = makeDeck();
    const outcome = applyDeckOperations(deck, [
      { op: "add", slide: { title: "Risques", content: "• Conformité", layout: "title-content" } },
    ]);

    expect(outcome.slides).toHaveLength(4);
    expect(outcome.slides.map((s) => s.title)).toEqual([
      "Intro",
      "Le Défi",
      "Solution",
      "Risques",
    ]);
    expect(outcome.slides[3].content).toBe("• Conformité");
    expect(outcome.touchedIndex).toBe(3);
    expect(outcome.addedIds).toHaveLength(1);
    expect(outcome.addedIds[0]).toBe(outcome.slides[3].id);
  });

  it("insère après l'index demandé", () => {
    const outcome = applyDeckOperations(makeDeck(), [
      { op: "add", afterIndex: 1, slide: { title: "Contexte" } },
    ]);

    expect(outcome.slides.map((s) => s.title)).toEqual([
      "Intro",
      "Le Défi",
      "Contexte",
      "Solution",
    ]);
    expect(outcome.touchedIndex).toBe(2);
  });

  it("ramène un afterIndex hors bornes à la fin du deck", () => {
    const outcome = applyDeckOperations(makeDeck(), [
      { op: "add", afterIndex: 99, slide: { title: "Annexe" } },
    ]);

    expect(outcome.slides).toHaveLength(4);
    expect(outcome.slides[3].title).toBe("Annexe");
  });

  it("ajoute dans un deck vide", () => {
    const outcome = applyDeckOperations([], [{ op: "add", slide: { title: "Première" } }]);

    expect(outcome.slides).toHaveLength(1);
    expect(outcome.slides[0].title).toBe("Première");
    expect(outcome.touchedIndex).toBe(0);
  });

  it("met à jour uniquement les champs fournis, sans toucher aux autres slides", () => {
    const deck = makeDeck();
    const outcome = applyDeckOperations(deck, [
      { op: "update", index: 1, slide: { title: "Le Défi (revu)" } },
    ]);

    expect(outcome.slides[1]).toMatchObject({
      id: "s2",
      title: "Le Défi (revu)",
      content: "",
      layout: "title-content",
    });
    expect(outcome.slides[0]).toEqual(deck[0]);
    expect(outcome.slides[2]).toEqual(deck[2]);
    expect(outcome.touchedIndex).toBe(1);
  });

  it("ignore une mise à jour sur un index invalide", () => {
    const outcome = applyDeckOperations(makeDeck(), [
      { op: "update", index: 5, slide: { title: "Fantôme" } },
    ]);

    expect(outcome.applied).toHaveLength(0);
    expect(outcome.slides.map((s) => s.title)).toEqual(["Intro", "Le Défi", "Solution"]);
    expect(outcome.touchedIndex).toBeNull();
  });

  it("supprime une slide", () => {
    const outcome = applyDeckOperations(makeDeck(), [{ op: "delete", index: 1 }]);

    expect(outcome.slides.map((s) => s.title)).toEqual(["Intro", "Solution"]);
    expect(outcome.touchedIndex).toBe(1);
  });

  it("déplace une slide", () => {
    const outcome = applyDeckOperations(makeDeck(), [
      { op: "move", fromIndex: 2, toIndex: 0 },
    ]);

    expect(outcome.slides.map((s) => s.title)).toEqual(["Solution", "Intro", "Le Défi"]);
    expect(outcome.applied).toHaveLength(1);
    expect(outcome.touchedIndex).toBe(0);
  });

  it("applique plusieurs opérations dans l'ordre", () => {
    const outcome = applyDeckOperations(makeDeck(), [
      { op: "add", slide: { title: "Risques" } },
      { op: "update", index: 0, slide: { content: "Nouveau contenu" } },
    ]);

    expect(outcome.slides).toHaveLength(4);
    expect(outcome.slides[0].content).toBe("Nouveau contenu");
    expect(outcome.applied).toHaveLength(2);
  });

  it("ne mute ni le tableau ni les slides d'entrée", () => {
    const deck = makeDeck();
    const snapshot = JSON.parse(JSON.stringify(deck));

    applyDeckOperations(deck, [
      { op: "update", index: 0, slide: { title: "Modifié" } },
      { op: "add", slide: { title: "Ajoutée" } },
      { op: "delete", index: 2 },
    ]);

    expect(deck).toEqual(snapshot);
  });

  it("ignore une opération inconnue", () => {
    const outcome = applyDeckOperations(makeDeck(), [
      { op: "replace-all", slides: [] } as unknown as Parameters<typeof applyDeckOperations>[1][0],
    ]);

    expect(outcome.applied).toHaveLength(0);
    expect(outcome.slides).toHaveLength(3);
  });
});
