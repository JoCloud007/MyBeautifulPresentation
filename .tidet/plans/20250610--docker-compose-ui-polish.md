# Plan : Docker Compose & UI Polish

## Context
The LLM Storytelling Integration feature is complete and passes all quality checks. The application has:
- Split-screen editor (storytelling + slide editor / thumbnails / preview)
- LLM integration via Ollama proxy API
- PPTX import/export
- 3 built-in templates (corporate, tech, minimal)
- Zustand stores with localStorage persistence
- Working Docker multi-stage build

This feature focuses on **production-ready Docker Compose orchestration** and **professional UI polish** to meet all acceptance criteria.

---

## 1. Docker Compose (Production-Ready)

### 1.1 `docker-compose.yml` — Production
- Add `OLLAMA_BASE_URL` env var defaulting to `http://ollama:11434` (inter-service DNS)
- Add healthcheck on the app service
- Add `restart: unless-stopped` to both services
- Make Ollama optional via profile `ollama` so the app can run standalone against an external Ollama
- Add explicit `container_name` for clarity
- Add comments explaining the two modes (bundled vs external Ollama)

### 1.2 `docker-compose.override.yml` — Development
- Mount local source for hot-reload
- Override `NODE_ENV=development`
- Expose Next.js dev port with polling
- Volume mount for `node_modules` preservation

### 1.3 `.env.example`
- `OLLAMA_BASE_URL=http://localhost:11434`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Document that in Docker the default is `http://ollama:11434`

### 1.4 LLM Store — Docker-Aware Default
- Update `defaultConfig.baseUrl` to read from `process.env.OLLAMA_BASE_URL` at build time, with fallback to `http://localhost:11434`
- This requires a small env-config approach: since the LLM store is client-side persisted, we only set the initial default from env; user overrides persist in localStorage

### 1.5 `README.md` — Docker Instructions
- `docker-compose up` (with bundled Ollama)
- `docker-compose --profile ollama up` (explicit)
- `docker-compose up app` (app only, external Ollama)
- Model pull instructions
- Troubleshooting section (CORS, memory, GPU)

---

## 2. UI Polish — Professional Corporate Design

### 2.1 Global Design System Refinements (`app/globals.css`)
- Refine CSS custom properties for a more premium feel:
  - Slightly warmer grays (less stark pure white/black)
  - Add subtle `--shadow-sm`, `--shadow-md`, `--shadow-lg` custom properties
  - Refine radius tokens for more modern feel
- Add `@layer utilities` for:
  - `.gradient-subtle` — subtle background gradient for preview area
  - `.glass` — frosted glass effect for overlays
- Improve scrollbar styling with template-aware colors

### 2.2 Toolbar (`app/components/Toolbar.tsx`)
- Add **keyboard shortcut hints** (tooltips with `Ctrl+N`, `Ctrl+S`, etc.)
- Better responsive behavior: collapse into a hamburger/dropdown on small screens
- Add **slide count badge** next to title
- Add **unsaved changes indicator** (dot when presentation modified since last export)
- Polish the title edit interaction with smoother transitions
- Add a **"Présentation"** menu dropdown grouping New / Import / Export / Metadata

### 2.3 Welcome / Empty State (`app/components/WelcomeScreen.tsx` — NEW)
- When no presentation exists (or on explicit "Nouveau"), show a beautiful welcome screen in the preview panel
- Content: app logo, quick-start guide (3 steps), template showcase cards
- Call-to-action: "Commencer un storytelling"
- This replaces the bland "Aucune présentation" text

### 2.4 Slide Viewer (`app/components/SlideViewer.tsx`)
- Add **fullscreen presentation mode** (browser fullscreen API)
- Add **presentation timer** in fullscreen mode
- Improve zoom transitions with Framer Motion
- Add **slide transition animations** between slides (subtle fade + slight translate)
- Better placeholder when no slide selected

### 2.5 Slide Thumbnails (`app/components/SlideThumbnails.tsx`)
- Add **drag-and-drop reordering** using native HTML5 DnD
- Add **hover zoom** on thumbnails (slight scale on hover)
- Better visual hierarchy: current slide gets a stronger shadow + border
- Add **slide count badge** at the top of the panel

### 2.6 Template Selector (`app/components/TemplateSelector.tsx`)
- Redesign with **larger preview cards** showing mini slide mockups
- Add **template category badges**
- Add **hover preview**: on hover, temporarily show template applied to current slide in the main viewer (or a tooltip preview)
- Better color swatches with rounded chips

### 2.7 Story Editor (`app/components/StoryEditor.tsx`)
- Add **placeholder animation** (typing effect) in the textarea when empty
- Improve the generate button with a **progress bar** during generation
- Better streaming text area styling (monospace, line numbers feel)
- Add **"Copier"** button for the generated raw response

### 2.8 Status Bar — NEW (`app/components/StatusBar.tsx`)
- Bottom bar showing:
  - Total slides count
  - Current template name
  - LLM connection status (compact dot + label)
  - Last saved / export timestamp
  - Keyboard shortcut hint: "Ctrl+← → pour naviguer"

### 2.9 Layout (`app/page.tsx`)
- Add StatusBar at the bottom
- Improve panel resizing constraints for better UX on smaller screens
- Ensure the 3-panel layout collapses gracefully

### 2.10 `app/layout.tsx`
- Update metadata with OpenGraph tags
- Add `theme-color` meta tag
- Ensure proper lang="fr"

---

## 3. Accessibility & Responsiveness

### 3.1 Accessibility
- Add `aria-label` to all icon-only buttons
- Ensure color contrast ratios meet WCAG AA
- Add `sr-only` text where needed
- Trap focus in modals (Dialog from Radix already does this, verify)

### 3.2 Responsive
- On screens < 1024px: switch to a 2-panel layout (hide thumbnails, show them in a drawer/popover)
- On screens < 768px: single-panel with tab navigation (Story | Slides | Preview)
- Ensure touch targets are ≥ 44px

---

## 4. Files to Modify / Create

### Modify
| File | Changes |
|------|---------|
| `docker-compose.yml` | Profiles, healthchecks, env vars, optional Ollama |
| `Dockerfile` | Minor: add `ENV OLLAMA_BASE_URL` default |
| `.env.example` | NEW — documented env vars |
| `docker-compose.override.yml` | NEW — dev overrides |
| `app/globals.css` | Shadow utilities, refined colors, scrollbar polish |
| `app/layout.tsx` | Meta tags, theme-color |
| `app/page.tsx` | StatusBar integration, responsive panels |
| `app/components/Toolbar.tsx` | Menu dropdown, shortcuts, responsive, unsaved indicator |
| `app/components/SlideViewer.tsx` | Fullscreen mode, better animations |
| `app/components/SlideThumbnails.tsx` | DnD reordering, hover effects |
| `app/components/TemplateSelector.tsx` | Larger cards, category badges |
| `app/components/StoryEditor.tsx` | Progress bar, placeholder animation |
| `app/stores/llmStore.ts` | Read env var for default baseUrl |
| `README.md` | Docker usage, troubleshooting |

### Create
| File | Purpose |
|------|---------|
| `app/components/WelcomeScreen.tsx` | Beautiful empty state |
| `app/components/StatusBar.tsx` | Bottom status bar |
| `.env.example` | Environment variable template |
| `docker-compose.override.yml` | Development overrides |

---

## 5. Implementation Order

1. **Docker foundation** — `docker-compose.yml`, `.env.example`, `docker-compose.override.yml`, README
2. **Global styles** — `globals.css` refinements
3. **StatusBar + WelcomeScreen** — New components
4. **Toolbar polish** — Menu, shortcuts, responsive
5. **SlideThumbnails DnD** — Reordering
6. **TemplateSelector redesign** — Better previews
7. **SlideViewer enhancements** — Fullscreen, animations
8. **StoryEditor polish** — Progress bar
9. **Responsive layout** — `page.tsx` breakpoints
10. **Quality verification**

---

## 6. Quality Verification

| Check | Target |
|-------|--------|
| `npm run build` | ✅ Passes |
| `npx tsc --noEmit` | ✅ Zero errors |
| `npx eslint app/components/` | ✅ Zero errors |
| `docker build -t mybp-test .` | ✅ Passes |
| `docker-compose up` | ✅ App + Ollama start |
| `docker-compose up app` | ✅ App only starts, connects to external Ollama |
| Manual UI test | All panels render, no layout breakage |
