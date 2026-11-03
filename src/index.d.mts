// index.d.mts
// path: src/index.d.mts
// Types for src/index.mjs. TypeScript does not read JSDoc from a package under
// node_modules, so a site's astro.config.mjs needs these to type-check.

import type { StarlightPlugin } from '@astrojs/starlight/types';
import type { LikeC4VitePlugin } from 'likec4/vite-plugin';

/**
 * LikeC4 syntax highlighting, derived from the Langium grammar in
 * `likec4/likec4` and registered with the site's Expressive Code.
 */
export interface LikeC4HighlightingOptions {
	/**
	 * Branch, tag or commit SHA to read `like-c4.langium` from.
	 * Defaults to `main`; pin a tag (`v1.59.4`) or a SHA for reproducible CI.
	 * Also read from `ASTROC4_REF`.
	 */
	ref?: string;
	/** Repository to read from. Defaults to `likec4/likec4`. */
	repo?: string;
	/** Use the bundled snapshot and never touch the network. Also `ASTROC4_OFFLINE=1`. */
	offline?: boolean;
	/**
	 * What to do when the grammar cannot be fetched. Defaults to `fail`, so
	 * `astro build` and `astro check` fail like any other build error.
	 * A `ref` that does not exist always fails.
	 */
	onError?: 'fail' | 'warn' | 'silent';
	/** Seconds a cached fetch stays fresh. Defaults to an hour. */
	cacheTtl?: number;
	/** Ignore the cache and refetch. */
	refresh?: boolean;
	/** Where to cache. Defaults to `node_modules/.cache/astroc4`. */
	cacheDir?: string;
	/** Raw host to read from, for mirrors. Defaults to raw.githubusercontent.com. */
	baseUrl?: string;
	/** Request timeout in milliseconds. Defaults to 15000. */
	timeout?: number;
}

export interface StarlightLikeC4Options {
	/**
	 * Passed through to `LikeC4VitePlugin` — e.g. `{ workspace: 'diagrams' }` to
	 * look for .c4 files somewhere other than the site root.
	 */
	vitePlugin?: Parameters<typeof LikeC4VitePlugin>[0];
	/** Render ```likec4 fences in .mdx pages as diagrams. Defaults to `true`. */
	fences?: boolean;
	/**
	 * Highlight ```c4 / ```likec4 source. Defaults to `true`; `false` leaves
	 * Expressive Code entirely to the site.
	 */
	highlighting?: boolean | LikeC4HighlightingOptions;
}

export default function starlightLikeC4(options?: StarlightLikeC4Options): StarlightPlugin;

/** Adds the LikeC4 language to a site's Expressive Code options, preserving the rest. */
export declare function withLikeC4Language(
	expressiveCode: unknown,
	registration: Record<string, unknown>,
): Record<string, unknown> & { shiki: { langs: unknown[] } };

