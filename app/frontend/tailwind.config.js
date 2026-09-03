/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nanami Medium"', 'Nanami', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        background: "#09090b",
        surface: "#121215",
        surfaceBorder: "#27272a",
        accentBlue: "#3b82f6",
        accentGreen: "#10b981",
        accentRed: "#ef4444",
        accentAmber: "#f59e0b",
      },
    },
  },
  plugins: [],
}

