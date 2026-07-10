import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        forest: {
          50: "#f2f6f3",
          100: "#dde8e0",
          200: "#bcd1c3",
          300: "#8fb29a",
          400: "#5f8f70",
          500: "#3f7152",
          600: "#2c5940",
          700: "#234634",
          800: "#1c3829",
          900: "#152a1f",
          950: "#0d1a14",
        },
        stone: {
          50: "#faf8f4",
          100: "#f3efe6",
          150: "#ede6d8",
          200: "#e5dcc9",
          300: "#d3c5a8",
          400: "#b9a67f",
          500: "#a08c62",
          600: "#87714e",
          700: "#6c5940",
          800: "#4a3d2d",
          900: "#2e261b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(21 42 31 / 0.06), 0 1px 3px 0 rgb(21 42 31 / 0.08)",
        "card-hover": "0 4px 12px 0 rgb(21 42 31 / 0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
