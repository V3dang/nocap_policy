import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pitch: "#000000",
        lime: "#CCFF00",
        neon: "#9B5DFF",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(204,255,0,0.35), 0 0 30px rgba(204,255,0,0.25)",
        purpleGlow: "0 0 0 1px rgba(155,93,255,0.45), 0 0 25px rgba(155,93,255,0.35)",
      },
      backdropBlur: {
        xs: "2px",
      },
      borderRadius: {
        brutal: "1.15rem",
      },
      keyframes: {
        pulseScan: {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.03)" },
        },
      },
      animation: {
        pulseScan: "pulseScan 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
