import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)"],
      },
      colors: {
        bg: "#060816",
        panel: "#0d1325",
        panelAlt: "#111a33",
        line: "#223458",
        accent: "#7ef2c6",
        cobalt: "#6aa4ff",
        amber: "#ffb86b",
        danger: "#ff7373",
        text: "#e8eefc",
        muted: "#8ba0c7",
      },
      backgroundImage: {
        "orbital-grid":
          "radial-gradient(circle at top, rgba(126,242,198,0.18), transparent 32%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "orbital-grid": "auto, 28px 28px, 28px 28px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(126,242,198,0.16), 0 24px 60px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
