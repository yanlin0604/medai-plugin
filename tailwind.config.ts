import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: "#eff6ff", 100: "#dbeafe", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
        medical: { success: "#10b981", warning: "#f59e0b", danger: "#ef4444", info: "#3b82f6" },
      },
    },
  },
  plugins: [],
} satisfies Config;
