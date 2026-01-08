/**
 * @file +layout.js
 * @description Configure client-only rendering for the static log viewer.
 * @role Routing configuration for static hosting on GitHub Pages.
 *
 * @pseudocode
 *  1. Disable server-side rendering for client auth flows.
 *  2. Enable prerendering for static output.
 *  3. Force trailing slashes for GitHub Pages routing.
 *  4. Export the configuration constants.
 */

export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';
