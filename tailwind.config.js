/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        paper: "#F5F6F7",
        surface: "#FFFFFF",
        border: "#DADDE1",
        accent: "#E85D2A",
        "accent-dark": "#C64A1E",
        steel: "#2B5C77",
        "steel-dark": "#1F4459",
        success: "#3A7D44",
        warn: "#C69214",
      },
      fontFamily: {
        display: ["Oswald", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
