// vitest.config.ts
// path: vitest.config.ts (repo root)
// Unit tests for the pure helpers, the Langium scanner and the generated
// grammar only — rendering is covered by building the playground, so Vitest
// deliberately does not load the Astro or LikeC4 Vite plugins.
//
// Everything here is hermetic. The one check that talks to likec4/likec4 lives
// in src/grammar/__tests__/network.test.ts and only runs with
// `ASTROC4_NETWORK=1` (see `bun run test:network`).

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
