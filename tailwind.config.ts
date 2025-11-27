import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // カタン風のカラーパレット
        hex: {
          forest: "#228B22",
          pasture: "#90EE90",
          field: "#FFD700",
          hill: "#CD853F",
          mountain: "#696969",
          desert: "#F5DEB3",
          ocean: "#4169E1",
        },
      },
    },
  },
  plugins: [],
};

export default config;
