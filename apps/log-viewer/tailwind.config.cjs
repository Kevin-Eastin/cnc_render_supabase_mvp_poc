/**
 * @file tailwind.config.cjs
 * @description Tailwind theme configuration for the log viewer UI.
 * @role Design system configuration for utility classes.
 *
 * @pseudocode
 *  1. Define content paths for class scanning.
 *  2. Extend the theme with custom colors and fonts.
 *  3. Export the Tailwind config object.
 *  4. Keep plugins minimal for the PoC.
 */

module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        cream: "rgb(var(--color-cream) / <alpha-value>)",
        sand: "rgb(var(--color-sand) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        accent2: "rgb(var(--color-accent-2) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)"
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      boxShadow: {
        glow: "0 18px 45px -30px rgba(0, 0, 0, 0.5)"
      }
    }
  },
  plugins: []
};
