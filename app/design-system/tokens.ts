/**
 * Semantic Design Tokens
 * ----------------------
 * Central source of truth for the MyBeautifulPresentation design system.
 * All visual values are expressed semantically (surface, text, animation)
 * so that components remain decoupled from raw CSS values.
 */

export const semanticTokens = {
  /** Surface tokens — backgrounds, fills, borders */
  surface: {
    background: {
      DEFAULT: "var(--background)",
      elevated: "var(--card)",
      overlay: "var(--popover)",
      muted: "var(--muted)",
      inverse: "var(--foreground)",
    },
    border: {
      DEFAULT: "var(--border)",
      subtle: "var(--input)",
      strong: "var(--ring)",
    },
    accent: {
      DEFAULT: "var(--primary)",
      hover: "var(--primary) / 0.9",
      muted: "var(--accent)",
    },
    feedback: {
      success: "#16a34a",
      warning: "#d97706",
      error: "var(--destructive)",
      info: "#2563eb",
    },
  },

  /** Text tokens — typographic colour hierarchy */
  text: {
    primary: {
      DEFAULT: "var(--foreground)",
      inverse: "var(--background)",
    },
    secondary: {
      DEFAULT: "var(--muted-foreground)",
      inverse: "var(--muted)",
    },
    accent: {
      DEFAULT: "var(--primary)",
      muted: "var(--secondary-foreground)",
    },
    onAccent: {
      DEFAULT: "var(--primary-foreground)",
    },
    /** WCAG AA guaranteed contrast ratios (4.5:1 on normal text, 3:1 on large) */
    contrast: {
      AA_normal: 4.5,
      AA_large: 3.0,
      AAA_normal: 7.0,
    },
  },

  /** Animation tokens — motion language */
  animation: {
    duration: {
      instant: "0ms",
      fast: "150ms",
      normal: "250ms",
      slow: "400ms",
    },
    easing: {
      DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      enter: "cubic-bezier(0, 0, 0.2, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
      bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
  },

  /** Spacing tokens — 4px base grid */
  space: {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
    20: "80px",
    24: "96px",
  },

  /** Typography scale — modular scale 1.25 (major third) */
  type: {
    scale: {
      xs: "0.75rem",   // 12px
      sm: "0.875rem",  // 14px
      base: "1rem",    // 16px
      lg: "1.125rem",  // 18px
      xl: "1.25rem",   // 20px
      "2xl": "1.5rem", // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem",  // 36px
      "5xl": "3rem",     // 48px
      "6xl": "3.75rem",  // 60px
    },
    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    leading: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.65,
    },
  },

  /** Layout grid — 12 columns with 24px gutters */
  grid: {
    columns: 12,
    gutter: "24px",
    margin: "5vw",
    maxWidth: "1280px",
  },
} as const;

/** Helper type for token keys */
export type SemanticTokens = typeof semanticTokens;
