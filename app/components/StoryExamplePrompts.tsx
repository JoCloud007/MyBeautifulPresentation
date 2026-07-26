"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

export interface ExamplePrompt {
  label: string;
  text: string;
}

const examplePrompts: ExamplePrompt[] = [
  {
    label: "Pitch startup",
    text: "Je dois pitcher ma startup DevFlow, une plateforme d'automatisation CI/CD pour équipes de développement. Le public est composé de business angels. Je veux montrer le problème des pipelines lents, notre solution unique avec IA, le marché de 12 Mds€, notre traction avec 50 clients, et notre équipe d'anciens Google.",
  },
  {
    label: "Rapport annuel",
    text: "Présentation du rapport annuel 2024 de l'entreprise TechCorp. Résultats financiers : CA +23%, marge opérationnelle 18%. Nouveaux produits lancés : 3. Expansion géographique : Asie-Pacifique. Objectifs 2025 : internationalisation et R&D green tech. Public : actionnaires et analystes.",
  },
  {
    label: "Formation équipe",
    text: "Formation sur la cybersécurité pour les employés d'une entreprise de 200 personnes. Les points à couvrir : les phishing et comment les reconnaître, les mots de passe et l'authentification forte, la sécurité des données personnelles, et les bonnes pratiques du télétravail. Ton pédagogique et concret avec des exemples.",
  },
  {
    label: "Stratégie marketing",
    text: "Stratégie marketing digital 2025 pour une marque de cosmétiques naturels. Cible : femmes 25-40 ans urbaines. Canaux : Instagram, TikTok, newsletters. Actions : influencer marketing, UGC, partnerships avec spas. Budget 500K€. KPIs : awareness, acquisition, rétention.",
  },
  {
    label: "Réunion projet",
    text: "Réunion de lancement du projet \u00abMigration Cloud\u00bb pour une banque. Contexte : infra legacy sur serveurs physiques. Objectif : migrer 80% des workloads sur AWS en 18 mois. Équipe : 15 personnes, 3 squads. Risques : conformité réglementaire, downtime. Livrables : architecture cible, planning, budget.",
  },
];

interface StoryExamplePromptsProps {
  onSelect: (text: string) => void;
}

export function StoryExamplePrompts({ onSelect }: StoryExamplePromptsProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" />
          Exemples de storytelling
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {examplePrompts.map((prompt) => (
            <Button
              key={prompt.label}
              variant="outline"
              size="sm"
              className="text-[11px] h-7 px-2.5 bg-background hover:bg-accent"
              onClick={() => {
                onSelect(prompt.text);
                setExpanded(false);
              }}
            >
              {prompt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
