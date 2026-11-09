// No `ec.config.mjs` on purpose: the plugin registers LikeC4 highlighting with
// Expressive Code itself. The French locale exercises the i18n overrides in
// src/content/i18n/fr.json.

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

import starlightLikeC4 from '@purview-dev/astroc4';

export default defineConfig({
	integrations: [
		starlight({
			title: 'astroc4 playground',
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				fr: { label: 'Français', lang: 'fr' },
			},
			// Lives outside the site, with `@` → ./images in its own config.
			plugins: [starlightLikeC4({ projects: { external: '../playground-external' } })],
			sidebar: [
				{ label: 'Project views', slug: 'index' },
				{ label: 'Named projects', slug: 'named-projects' },
				{ label: 'Fences', slug: 'fences' },
				{ label: 'Fences in Markdown', slug: 'markdown-fences' },
				{ label: 'Highlighting', slug: 'highlighting' },
				{ label: 'Error states', slug: 'errors' },
			],
		}),
		react(),
	],
});
