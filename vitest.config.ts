// Deliberately no Astro or LikeC4 Vite plugins: rendering is covered by the
// site builds.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
