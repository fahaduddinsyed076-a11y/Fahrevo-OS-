import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#b5177e",
          dark: "#8e1263",
          light: "#fdf2f9",
        },
      },
    },
  },
  plugins: [],
};

export default config;
