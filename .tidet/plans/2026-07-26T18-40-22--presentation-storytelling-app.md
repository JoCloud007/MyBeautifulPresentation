---
schema_version: 1
slug: 2026-07-26T18-40-22--presentation-storytelling-app
title: 'Plan : MyBeautifulPresentation — Générateur de Présentations via Storytelling'
status: proposed
created_at: 2026-07-26T16:42:13.860791Z
run_id: 422c4b84-09e2-49b4-a928-f567d5c9e659
---

# Plan : MyBeautifulPresentation — Générateur de Présentations via Storytelling

## Contexte
Application web permettant de générer des présentations PowerPoint à partir d'un storytelling en langage naturel. Interface split-screen (éditeur / preview), intégration LLM, import/export PPTX, templates, et conteneurisation Docker.

---

## Stack Technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Framework | **Next.js 15 (App Router)** | React moderne, SSR/SSG, API routes intégrées, DX excellente |
| Langage | **TypeScript** | Typage fort, maintenabilité |
| Styling | **Tailwind CSS + shadcn/ui** | Design system professionnel rapide à implémenter |
| State | **Zustand** | Léger, TypeScript-native, pas de boilerplate |
| LLM Client | **Native fetch** vers API Ollama | Pas de dépendance lourde, REST simple |
| PPTX Gen | **pptxgenjs** (client-side) | Génération PPTX purement frontend, pas de backend nécessaire |
| PPTX Import | **pptx-parser** ou **JSZip + xml2js** | Extraction du contenu PPTX (format ZIP/XML) |
| Icons | **Lucide React** | Clean, cohérent, tree-shakeable |
| Docker | **Multi-stage build** | Image légère, build optimisé |

---

## Architecture

```
my-beautiful-presentation/
├── app/
│   ├── page.tsx                 # Page principale (split-screen)
│   ├── layout.tsx               # Root layout + providers
│   ├── globals.css              # Styles globaux + Tailwind
│   ├── api/
│   │   └── llm/
│   │       └── generate/route.ts  # Proxy API vers Ollama (CORS/evitement)
│   ├── components/
│   │   ├── Header.tsx           # Barre supérieure (logo, actions)
│   │   ├── StoryEditor.tsx      # Panneau gauche : éditeur storytelling
│   │   ├── SlidePreview.tsx     # Panneau droit : preview live
│   │   ├── SlideThumbnails.tsx  # Bandeau miniatures en bas
│   │   ├── SlideNavigator.tsx   # Navigation slide (précédent/suivant)
│   │   ├── LLMConfigModal.tsx   # Modal config Ollama/LLM
│   │   ├── TemplateSelector.tsx # Modal choix template
│   │   ├── PPTXImportModal.tsx  # Modal import PPTX
│   │   └── SlideRenderer.tsx    # Rendu d'une slide ( différents layouts )
│   ├── hooks/
│   │   ├── useLLM.ts            # Hook appel LLM (streaming)
│   │   ├── usePPTXExport.ts     # Hook export PPTX via pptxgenjs
│   │   ├── usePPTXImport.ts     # Hook import/parse PPTX
│   │   └── useSlides.ts         # Hook gestion état slides
│   ├── store/
│   │   └── slidesStore.ts       # Zustand : état global slides + config
│   ├── types/
│   │   └── index.ts             # Types TypeScript (Slide, Template, LLMConfig...)
│   ├── lib/
│   │   ├── llm.ts               # Client LLM (Ollama API)
│   │   ├── pptxExport.ts        # Logique génération PPTX
│   │   ├── pptxImport.ts        # Logique parsing PPTX
│   │   ├── templates.ts         # Templates intégrés (définitions)
│   │   └── utils.ts             # Utilitaires
│   └── templates/
│       └── built-in/            # Templates intégrés (JSON définissant styles)
├── components/ui/               # shadcn/ui components
├── public/
│   └── templates/               # Assets templates (images de fond, etc.)
├── Dockerfile
├── docker-compose.yml
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## Modèle de Données

### Slide
```typescript
interface Slide {
  id: string;
  layout: 'title' | 'title-content' | 'two-column' | 'image-left' | 'image-right' | 'quote' | 'section-header';
  title: string;
  subtitle?: string;
  content?: string;           // Markdown/texte brut
  bulletPoints?: string[];
  imageUrl?: string;          // URL ou base64
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  notes?: string;             // Notes présentateur
}
```

### LLMConfig
```typescript
interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  baseUrl: string;            // ex: http://localhost:11434
  model: string;              // ex: llama3.2:3b
  temperature: number;        // 0.0 - 1.0
  maxTokens: number;
  apiKey?: string;            // Pour OpenAI/Anthropic
}
```

### Presentation
```typescript
interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
  template: Template;
  createdAt: Date;
  updatedAt: Date;
}
```

### Template
```typescript
interface Template {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  // ... définition des styles par layout
}
```

---

## Fonctionnalités par Phase

### Phase 1 — Core (MVP)
1. **Structure Next.js + Docker**
   - Init projet Next.js 15 + Tailwind + shadcn/ui
   - Dockerfile multi-stage (builder → runner)
   - docker-compose.yml avec service app + service ollama (optionnel)

2. **Layout Principal Split-Screen**
   - Panneau gauche : textarea storytelling avec auto-resize
   - Panneau droit : zone de preview avec dimensions 16:9
   - Header : logo, boutons d'action
   - Bandeau miniatures en bas du panneau droit

3. **Génération LLM**
   - Appel API Ollama (local) via route API Next.js (proxy pour éviter CORS)
   - Prompt engineering : convertir storytelling JSON structuré (slides)
   - Streaming de réponse pour feedback utilisateur
   - Parsing JSON → objets Slide

4. **Rendu Slide (HTML/CSS)**
   - 5 layouts de base : title, title-content, two-column, image-left, quote
   - Rendu conditionnel selon le layout
   - Application du template (couleurs, polices)

5. **Export PPTX**
   - Intégration pptxgenjs
   - Conversion Slide → objet PptxGenJS
   - Téléchargement fichier .pptx

### Phase 2 — Import & Templates
6. **Templates Intégrés**
   - 3-5 templates professionnels (Corporate, Tech, Minimal)
   - Sélecteur de template avec preview
   - Stockage définition template en JSON

7. **Import PPTX**
   - Upload fichier .pptx (input file)
   - Extraction ZIP → parsing XML
   - Conversion contenu XML → objets Slide
   - Option "Utiliser comme template" (extraire styles) ou "Importer contenu"

### Phase 3 — Polish
8. **Édition Interactive**
   - Édition inline du titre/contenu dans la preview
   - Réordonnancement drag-and-drop des slides (bandeau miniatures)
   - Ajout/suppression de slides individuelles

9. **Configuration LLM Avancée**
   - Modal settings : URL Ollama, choix modèle, température
   - Liste modèles disponibles (appel API /api/tags)
   - Support OpenAI/Anthropic (optionnel)

10. **Améliorations UX**
    - Animations transitions slide (framer-motion)
    - Mode présentation plein écran
    - Sauvegarde locale (localStorage)
    - Undo/Redo

---

## Prompt LLM (Détail Clé)

Le prompt envoyé au LLM doit produire un JSON strict :

```
Tu es un expert en création de présentations PowerPoint. 
À partir du storytelling suivant, génère un tableau de slides au format JSON.

Règles :
- Chaque slide a un layout parmi : "title", "title-content", "two-column", "image-left", "quote", "section-header"
- Le contenu doit être concis et percutant (format bullet points)
- Adapte le nombre de slides à la richesse du storytelling
- N'invente pas d'images, mets imageUrl à null

Format attendu :
{
  "title": "Titre de la présentation",
  "slides": [
    {
      "layout": "title",
      "title": "...",
      "subtitle": "..."
    },
    {
      "layout": "title-content",
      "title": "...",
      "bulletPoints": ["...", "..."]
    }
  ]
}

Storytelling :
{storytelling}
```

---

## Dépendances Clés

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^4.0.0",
    "zustand": "^5.0.0",
    "pptxgenjs": "^3.12.0",
    "jszip": "^3.10.0",
    "xml2js": "^0.6.0",
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  }
}
```

---

## Docker

### Dockerfile
```dockerfile
# Étape 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Étape 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
```

---

## Risques & Mitigations

| Risque | Mitigation |
|--------|------------|
| LLM retourne JSON malformé | Parsing robuste avec retries, validation Zod, fallback message d'erreur |
| PPTX import complexe (formats variés) | Scope initial : texte + images simples, ignorer formes/animations complexes |
| Performance preview avec beaucoup de slides | Virtualisation du bandeau miniatures, rendu lazy |
| CORS Ollama | Proxy via route API Next.js (/api/llm/generate) |

---

## Livrables

1. Code source complet (ce repo)
2. Dockerfile + docker-compose.yml
3. README.md (installation, usage, config LLM)
4. Templates intégrés (3-5)

---

## Prochaines Étapes

1. **Approuver ce plan** → Je passe à l'implémentation
2. **Ajustements** → Modifier selon tes retours
3. **Scope initial** → Implémenter Phase 1 (MVP) d'abord
