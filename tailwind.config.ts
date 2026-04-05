import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./index.html",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#DC2626",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#1A1A1A",
          foreground: "#FFFFFF",
        },
        success: "#22C55E",
        warning: "#EAB308",
        destructive: "#EF4444",
        muted: "#71717A",
        accent: "#DC2626",
      },
      fontFamily: {
        heading: ["Orbitron", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
