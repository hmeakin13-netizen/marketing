import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#040907", // page background
        panel: "#0a1410", // cards
        line: "#143325", // borders
        neon: "#39ff88", // primary accent
        mute: "#8bb5a0", // secondary text (AA on ink and panel)
        body: "#d9f5e6", // primary text
      },
      boxShadow: {
        glow: "0 0 14px rgba(57,255,136,.45)",
        "glow-sm": "0 0 8px rgba(57,255,136,.35)",
      },
    },
  },
  plugins: [],
};
export default config;
