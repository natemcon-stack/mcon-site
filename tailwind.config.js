/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    screens: {
      // A breakpoint for the narrowest phones still in use, so the headline and rate
      // card can step up before the 640px default.
      xs: '400px',
      sm: '640px', md: '768px', lg: '1024px', xl: '1280px',
    },
    extend: {
      colors: {
        // Drawn from the existing M-CON logo and the materials of the work itself,
        // rather than a stock palette. The red is a signwriter's red — the colour of
        // the script M on the company's own sign — not a warm terracotta.
        // Sampled from the logo's script M, so the site and the sign match exactly.
        red: "#E81820",
        // For hover states and for red text on paper, where the bright red doesn't
        // hold enough contrast to read comfortably.
        "red-dark": "#B01018",
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
