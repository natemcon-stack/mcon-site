/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Drawn from the existing M-CON logo and the materials of the work itself,
        // rather than a stock palette. The red is a signwriter's red — the colour of
        // the script M on the company's own sign — not a warm terracotta.
        red: "#A3231B",
        "red-dark": "#7F1B15",
        ink: "#1E282C",
        concrete: "#ECEEEE",
        cedar: "#6E7A78",
        paper: "#FBFBFA",
        rule: "#C9CFCE",
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        body: ["'Source Serif 4'", "Georgia", "serif"],
      },
      maxWidth: {
        // Body copy sits under 70 characters; the serif tolerates a little more.
        prose: "34rem",
      },
    },
  },
  plugins: [],
};
