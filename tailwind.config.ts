import type { Config } from "tailwindcss";

/**
 * SOC Performance21 — Tailwind config.
 * Este arquivo é a única superfície de configuração do Design System.
 * Todos os tokens devem apontar para variáveis CSS em src/index.css.
 */
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.25rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]
        caption:  ["0.6875rem", { lineHeight: "1rem",      letterSpacing: "0.02em", fontWeight: "500" }],
        label:    ["0.75rem",   { lineHeight: "1rem",      letterSpacing: "0.02em", fontWeight: "500" }],
        small:    ["0.8125rem", { lineHeight: "1.125rem",  fontWeight: "400" }],
        body:     ["0.875rem",  { lineHeight: "1.375rem",  fontWeight: "400" }],
        subtitle: ["1rem",      { lineHeight: "1.5rem",    fontWeight: "500" }],
        h4:       ["1.125rem",  { lineHeight: "1.625rem",  fontWeight: "600" }],
        h3:       ["1.25rem",   { lineHeight: "1.75rem",   fontWeight: "600" }],
        h2:       ["1.5rem",    { lineHeight: "2rem",      fontWeight: "700" }],
        h1:       ["1.875rem",  { lineHeight: "2.25rem",   fontWeight: "700", letterSpacing: "-0.01em" }],
        display:  ["2.5rem",    { lineHeight: "3rem",      fontWeight: "800", letterSpacing: "-0.02em" }],
      },
      spacing: {
        // Escala 4pt oficial (usar exclusivamente estes valores)
        0.5: "0.125rem", // 2
        1:   "0.25rem",  // 4
        1.5: "0.375rem", // 6
        2:   "0.5rem",   // 8
        3:   "0.75rem",  // 12
        4:   "1rem",     // 16
        5:   "1.25rem",  // 20
        6:   "1.5rem",   // 24
        8:   "2rem",     // 32
        10:  "2.5rem",   // 40
        12:  "3rem",     // 48
        16:  "4rem",     // 64
        20:  "5rem",     // 80
        24:  "6rem",     // 96
      },
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          hover: "hsl(var(--secondary-hover))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          hover: "hsl(var(--destructive-hover))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          hover: "hsl(var(--accent-hover))",
          active: "hsl(var(--accent-active))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
          hover: "hsl(var(--surface-hover))",
          elevated: "hsl(var(--surface-elevated))",
        },
        brand: {
          blue: {
            DEFAULT: "hsl(var(--brand-blue))",
            strong: "hsl(var(--brand-blue-strong))",
            soft: "hsl(var(--brand-blue-soft))",
          },
          green: {
            DEFAULT: "hsl(var(--brand-green))",
            strong: "hsl(var(--brand-green-strong))",
            soft: "hsl(var(--brand-green-soft))",
          },
        },
        text: {
          primary: "hsl(var(--text-primary))",
          secondary: "hsl(var(--text-secondary))",
          muted: "hsl(var(--text-muted))",
          disabled: "hsl(var(--text-disabled))",
        },
        icon: {
          primary: "hsl(var(--icon-primary))",
          secondary: "hsl(var(--icon-secondary))",
        },
        overlay: "hsl(var(--overlay))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        focus: "var(--shadow-focus)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        DEFAULT: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
      },
      zIndex: {
        base: "0",
        dropdown: "40",
        sticky: "50",
        overlay: "60",
        modal: "70",
        popover: "80",
        toast: "90",
        tooltip: "100",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-green": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(78 56% 47% / 0.4)" },
          "50%": { boxShadow: "0 0 0 8px hsl(78 56% 47% / 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in": "slide-in var(--duration-slow) var(--ease-standard)",
        "fade-in": "fade-in var(--duration-base) var(--ease-standard)",
        "pulse-green": "pulse-green 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
