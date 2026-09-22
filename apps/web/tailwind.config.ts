import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)"],
      },
      colors: {
        graphite: "#0f1115",
        "space-panel": "#151921",
        paper: "#e7dfd1",
        "paper-highlight": "#ece4d7",
        saffron: "#c9782b",
        steel: "#7d868c",
        ice: "#8fa9b5",
        "dark-heading": "#131821",
        "light-heading": "#f2eee5",
        "light-body": "#d8d3ca",
        "admin-ink": "#172334",
        "secondary-ink": "#3f444b",
        "light-form-field": "#fffdf9",
        "light-focus": "#286da0",
        "dark-focus": "#7cc5ff",
        danger: "#9c2020",
        "danger-bg": "#fff4f3",
        bg: "#0f1115",
        panel: "#151921",
        line: "rgba(125, 134, 140, 0.32)",
        accent: "#c9782b",
        text: "#f2eee5",
        muted: "#d8d3ca",
      },
      backgroundImage: {
        "grid-texture-dark":
          "linear-gradient(rgba(125, 134, 140, 0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(125, 134, 140, 0.11) 1px, transparent 1px)",
        "grid-texture-light":
          "linear-gradient(rgba(23, 35, 52, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(23, 35, 52, 0.08) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-texture": "44px 44px",
      },
      boxShadow: {
        glass: "0 10px 24px rgba(10, 12, 16, 0.18)",
        "glass-hover": "0 14px 28px rgba(10, 12, 16, 0.24)",
        "modal-overlay": "0 0 0 1px rgba(10, 12, 16, 0.1), 0 24px 60px rgba(10, 12, 16, 0.45)",
      },
      borderRadius: {
        card: "0.2rem",
        control: "0.45rem",
        pill: "999px",
      },
      transitionDuration: {
        180: "180ms",
        220: "220ms",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 0.8, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
