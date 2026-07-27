# MyBeautifulPresentation

Generate beautiful presentations from natural language storytelling, powered by local LLMs via Ollama.

## Features

- **Storytelling to Slides** — Describe your presentation in plain text and let the AI generate structured slides
- **Local LLM Integration** — Connect to your own Ollama instance (no cloud API keys required)
- **Professional Templates** — Corporate, Tech, and Minimal themes with full color and font customization
- **Visual Layouts** — Title, content, two-column, image, **timeline**, and **GANTT** slide layouts
- **PPTX Import & Export** — Seamlessly work with existing PowerPoint files
- **Live Preview** — See your slides rendered in real-time as you edit
- **Docker Ready** — Run the entire stack with Docker Compose

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- [Ollama](https://ollama.com/) running locally (for AI-powered slide generation)

### Development

```bash
# Install dependencies
npm install

# Start the dev server on port 5182
npm run dev -- --port 5182
```

Open [http://localhost:5182](http://localhost:5182) in your browser.

### Docker

```bash
docker compose up --build
```

The app will be available at [http://localhost:5182](http://localhost:5182).

## Using the App

1. **Configure LLM** — Click "Config LLM" in the toolbar and enter your Ollama base URL (e.g., `http://localhost:11434`)
2. **Describe Your Presentation** — Write your story in the storytelling panel (e.g., "A 5-slide pitch about my AI startup...")
3. **Generate** — Click "Generate" and watch the AI create your slides
4. **Refine** — Switch to the Editor tab to adjust individual slides, layouts, and content
5. **Export** — Download your presentation as a `.pptx` file

### Timeline & GANTT Layouts

- **Timeline** — Enter events as `Date - Description` (one per line) for a visual horizontal timeline
- **GANTT** — Enter tasks as `Name | Start | Duration | Color` for a project chart

## Tech Stack

- [Next.js](https://nextjs.org/) 15 + React 19 + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand) for state management
- [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) for PPTX generation
- [Ollama](https://ollama.com/) for local LLM inference
- [Vitest](https://vitest.dev/) for testing

## License

MIT
