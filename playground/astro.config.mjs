// @ts-check
// astro.config.mjs
// path: playground/astro.config.mjs
// A minimal Starlight site for developing the plugin without a host site:
//   bun run dev      # http://localhost:4321
//
// The second locale exists to exercise the plugin's i18n — its strings come
// from src/content/i18n/fr.json, the same override path a real site uses.

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

import starlightLikeC4 from '../src/index.mjs';

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
