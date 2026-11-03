// index.d.mts
// path: src/index.d.mts
// Types for src/index.mjs. TypeScript does not read JSDoc from a package under
// node_modules, so a site's astro.config.mjs needs these to type-check.

import type { StarlightPlugin } from '@astrojs/starlight/types';
import type { LikeC4VitePlugin } from 'likec4/vite-plugin';

export interface StarlightLikeC4Options {
	/**
	 * Passed through to `LikeC4VitePlugin` — e.g. `{ workspace: 'diagrams' }` to
	 * look for .c4 files somewhere other than the site root.
	 */
	vitePlugin?: Parameters<typeof LikeC4VitePlugin>[0];
	/** Render ```likec4 fences in .mdx pages as diagrams. Defaults to `true`. */
	fences?: boolean;
}

export default function starlightLikeC4(options?: StarlightLikeC4Options): StarlightPlugin;
