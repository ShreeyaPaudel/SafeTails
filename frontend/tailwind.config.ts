import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Species marker palette (kept consistent across map + UI)
        dog: "#2563eb",
        cat: "#db2777",
        cow: "#16a34a",
        buffalo: "#7c3aed",
        other: "#64748b",
        injured: "#dc2626",
      },
    },
  },
  plugins: [],
};

export default config;
