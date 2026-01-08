/**
 * @file svelte.config.js
 * @description Configure SvelteKit for the log viewer app.
 * @role Build configuration layer for adapter and base paths.
 *
 * @pseudocode
 *  1. Import the static adapter helper.
 *  2. Normalize the base path for static hosting.
 *  3. Define the SvelteKit config object.
 *  4. Export the configuration.
 */

import adapter from '@sveltejs/adapter-static';

/**
 * @function normalizeBasePath
 * @description Normalize the BASE_PATH env var for static hosting.
 * @param {string | undefined} value - Raw BASE_PATH value.
 * @returns {string} Normalized base path with a leading slash.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Trim whitespace from the input value.
 *  - Strip leading and trailing slashes.
 *  - Return an empty string for blank values.
 *
 * @context
 *  Used to keep GitHub Pages paths consistent across environments.
 */
function normalizeBasePath(value) {
  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return '';
  }

  const withoutSlashes = trimmed.replace(/^\\/+|\\/+$/g, '');
  return `/${withoutSlashes}`;
}

const basePath = normalizeBasePath(process.env.BASE_PATH);

const config = {
  kit: {
    adapter: adapter({ fallback: '200.html' }),
    paths: {
      base: basePath,
      assets: basePath
    }
  }
};

export default config;
