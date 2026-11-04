// @ts-check
// astro.config.mjs
// path: playground/astro.config.mjs
// A minimal Starlight site for developing the plugin without a host site:
//   bun run dev      # http://localhost:4321
//
// The second locale exists to exercise the plugin's i18n — its strings come
// from src/content/i18n/fr.json, the same override path a real site uses.
//
// There is deliberately no `ec.config.mjs` here: the plugin registers LikeC4
// syntax highlighting with Expressive Code itself, from the Langium grammar at
// `highlighting.ref`. Uncomment the pinned version to build against a release
// instead of `main` (the default):
//   plugins: [starlightLikeC4({ highlighting: { ref: 'v1.59.4' } })],
//
// The plugin is imported from `dist/` — the built artifact, exactly what a site
// installs from npm. `bun run dev`, `check` and `build` run `build:lib` first.
// Importing `../src/index.ts` instead would put the plugin inside the Vite
// module runner that loads this config, and its dynamic `import()` of
// `@astrojs/markdown-satteri` then fails with "module runner has been closed".

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

import starlightLikeC4 from '../dist/index.js';

export default defineConfig({
	integrations: [
		starlight({
			title: 'astroc4 playground',
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				fr: { label: 'Français', lang: 'fr' },
			},
			plugins: [starlightLikeC4()],
			sidebar: [
				{ label: 'Project views', slug: 'index' },
				{ label: 'Fences', slug: 'fences' },
				{ label: 'Highlighting', slug: 'highlighting' },
				{ label: 'Error states', slug: 'errors' },
			],
		}),
		react(),
	],
});
