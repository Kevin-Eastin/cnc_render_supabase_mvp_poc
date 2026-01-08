/**
 * @file postcss.config.cjs
 * @description Configure PostCSS plugins for Tailwind and autoprefixer.
 * @role CSS processing configuration for the log viewer.
 *
 * @pseudocode
 *  1. Register Tailwind CSS plugin.
 *  2. Register Autoprefixer.
 *  3. Export the plugin configuration.
 *  4. Keep processing minimal for dev.
 */

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
