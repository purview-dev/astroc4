// vitest.config.ts
// path: vitest.config.ts (repo root)
// Unit tests for the pure helpers and the grammar only — rendering is covered
// by building the playground, so Vitest deliberately does not load the Astro
// or LikeC4 Vite plugins.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
