/**
 * @file vite.config.ts
 * @description Define Vite configuration for the SvelteKit app.
 * @role Local dev and build configuration for Vite.
 *
 * @pseudocode
 *  1. Import the SvelteKit Vite plugin.
 *  2. Export a Vite config with the plugin enabled.
 *  3. Keep the setup minimal for local usage.
 *  4. Rely on defaults for build output.
 */

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
