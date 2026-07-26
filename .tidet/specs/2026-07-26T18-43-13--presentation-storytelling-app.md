# Spec : MyBeautifulPresentation

## Context
Application web permettant de générer des présentations PowerPoint à partir d'un storytelling en langage naturel. Interface split-screen (éditeur à gauche / preview live à droite), intégration LLM, import/export PPTX, templates intégrés, et conteneurisation Docker.

## Goals
- Interface split-screen : éditeur storytelling (gauche) + preview live (droite)
- Génération de slides via LLM (Ollama en local, configurable)
- Export des présentations en format PPTX
- Import de fichiers PPTX comme template ou contenu initial
- Templates professionnels intégrés (corporate, tech, minimal)
- Configuration LLM via UI (URL, modèle, température)
- Conteneurisation Docker complète (app + Ollama optionnel)
- Design professionnel / corporate

## Non-goals
- Support de formes complexes, animations, ou transitions PowerPoint avancées dans l'import
- Collaboration temps réel multi-utilisateur
- Stockage cloud / backend persistant (localStorage uniquement)
- Support de langues autres que le français dans l'UI (mais le storytelling peut être dans n'importe quelle langue)

## Decisions
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui pour le design system
- **State**: Zustand (léger, TypeScript-native)
- **LLM**: Ollama via API REST locale, proxy via route API Next.js
- **PPTX Generation**: pptxgenjs côté client (pas de backend nécessaire)
- **PPTX Import**: JSZip + xml2js pour parser le ZIP XML
- **Docker**: Multi-stage build Node.js 20 Alpine
- **Icons**: Lucide React
- **Animations**: Framer Motion (Phase 3)

## Acceptance Criteria
- [ ] L'application démarre dans Docker (`docker-compose up`)
- [ ] L'utilisateur peut saisir un storytelling et générer des slides via LLM
- [ ] Les slides s'affichent en preview live avec navigation
- [ ] L'utilisateur peut exporter la présentation en PPTX téléchargeable
- [ ] L'utilisateur peut importer un fichier PPTX
- [ ] 3 templates professionnels intégrés sont disponibles
- [ ] La configuration LLM (URL, modèle, température) est accessible via UI
- [ ] Le design est professionnel / corporate et responsive
