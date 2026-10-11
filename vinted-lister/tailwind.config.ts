import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "#faf7f2", // warm off-white background
        panel: "#ffffff", // cards
        line: "#e8e2d9", // borders
        brand: "#0a7f72", // fresh green-teal; white text on it is 5:1
        "brand-dark": "#086a5f",
        tint: "#e4f4f1", // soft brand wash
        mute: "#5d6b6a", // secondary text (AA on page and panel)
        body: "#1f2a2b",
      },
      boxShadow: { card: "0 1px 2px rgba(31,42,43,.06), 0 4px 14px rgba(31,42,43,.05)" },
      borderRadius: { xl: "1rem" },
    },
  },
  plugins: [],
};
export default config;
