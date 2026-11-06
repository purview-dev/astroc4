// integration.ts
// path: src/integration.ts
// The Astro integration: everything `<LikeC4View>` and ```likec4 fences need,
// with no Starlight in the picture.
//
//   import astroc4 from '@purview-dev/astroc4/integration';
//   export default defineConfig({ integrations: [astroc4(), react()] });
//
// `src/index.ts` is the Starlight plugin, and it is this integration plus the
// three things that only exist inside Starlight: the UI-string injection
// (`i18n:setup`), Starlight's `expressiveCode` option, and Starlight's
// `config:setup` context (which is where `astroConfig` and its plugins array
// live). Both entry points call *this* file, so the Vite plugin, the fence
// transform, the Windows preload and the `react/compiler-runtime` fix cannot
// drift between them.
//
// A plain Astro site still supplies, because they are not this package's to add:
//   - `@astrojs/react` — the diagrams are React islands (`client:only="react"`);
//   - `@astrojs/mdx` — ```likec4 fences only become diagrams in .mdx pages;
//   - Expressive Code (`astro-expressive-code` + `ec.config.mjs`) with
//     `likec4Language` from `@purview-dev/astroc4/expressive-code` — Astro has no
//     `expressiveCode` option for this integration to fill in, which is why
//     highlighting is Starlight-only unless the site configures EC itself.

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroConfig, AstroIntegration, AstroIntegrationLogger } from 'astro';
import { LikeC4VitePlugin } from 'likec4/vite-plugin';

import { likec4Fences, preloadLikeC4 } from './fences.js';

/**
 * The published package name. Scoped because npm refuses the unscoped
 * `astroc4` — "too similar to existing package astro" — and because the scope
 * makes the specifiers this plugin writes into a site's pages unambiguous.
 */
export const PACKAGE_NAME = '@purview-dev/astroc4';

export interface LikeC4IntegrationOptions {
	/**
	 * Passed through to `LikeC4VitePlugin` — e.g. `{ workspace: 'diagrams' }` to
	 * look for .c4 files somewhere other than the site root.
	 */
	vitePlugin?: Parameters<typeof LikeC4VitePlugin>[0];
	/** Render ```likec4 fences in .mdx pages as diagrams. Defaults to `true`. */
	fences?: boolean;
}

/**
 * Dependencies the browser entry point needs Vite to pre-bundle.
 *
 * `likec4/react` is compiled with the React Compiler, so it imports `c` from
 * `react/compiler-runtime` — a CommonJS file (`module.exports = require(...)`)
 * on every React 19. The island itself is source in this package, so in dev
 * Vite can serve that import raw instead of rewriting it to an optimized ES
 * module, and the island dies before it mounts:
 *
 *   [astro-island] Error hydrating /node_modules/@purview-dev/astroc4/src/components/LikeC4ProjectView.tsx
 *   SyntaxError: The requested module '/node_modules/react/compiler-runtime.js'
 *   does not provide an export named 'c'
 *
 * `astro build` bundles the dependency correctly, which is exactly why the
 * failure is easy to miss: the site builds green with blank diagrams. Listing
 * it as an optimized dependency is the fix.
 */
const OPTIMIZED_DEPENDENCIES = ['react/compiler-runtime'];

/**
 * The `optimizeDeps.include` entries a site still needs for the island to
 * hydrate.
 *
 * Only the missing ones are returned: Astro merges the `vite` option with
 * Vite's `mergeConfig`, which concatenates arrays, so re-sending a site's own
 * entries would duplicate them. An entry that does not resolve is left out —
 * a site without React cannot render the island anyway, and naming a package
 * Vite cannot find breaks the optimizer with a less useful error.
 *
 * @param include The site's existing `vite.optimizeDeps.include`.
 * @param root The site root, where the dependency has to resolve from.
 */
export function missingOptimizedDependencies(include: unknown, root: string): string[] {
	const existing = Array.isArray(include) ? include : [];

	return OPTIMIZED_DEPENDENCIES.filter(
		(dependency) => !existing.includes(dependency) && resolvesFrom(dependency, root),
	);
}

/** Whether `specifier` resolves from a site root. */
function resolvesFrom(specifier: string, root: string): boolean {
	try {
		// `createRequire` only uses the path as a resolution base, so the file it
		// names need not exist (`playground/` has no `package.json` of its own).
		createRequire(join(root, 'package.json')).resolve(specifier);
		return true;
	} catch {
		return false;
	}
}

/**
 * The integration both entry points install: LikeC4's Vite plugin, the fence
 * transform, and the dev-only bits that keep the islands hydrating.
 */
export function likec4Integration({
	vitePlugin = {},
	fences = true,
}: LikeC4IntegrationOptions = {}): AstroIntegration {
	return {
		name: `${PACKAGE_NAME}/integration`,
		hooks: {
			'astro:config:setup': async ({ command, config, updateConfig, logger }) => {
				const optimizeDeps = missingOptimizedDependencies(
					config.vite?.optimizeDeps?.include,
					fileURLToPath(config.root),
				);

				updateConfig({
					vite: {
						plugins: [LikeC4VitePlugin(vitePlugin)],
						// The components ship as .astro/.tsx source, so Vite has to
						// transform them rather than hand them to Node as-is.
						ssr: { noExternal: [PACKAGE_NAME] },
						// Omitted entirely when the site already lists them: `vite` is
						// merged with Vite's `mergeConfig`, which concatenates arrays.
						...(optimizeDeps.length > 0 ? { optimizeDeps: { include: optimizeDeps } } : {}),
					},
				});

				if (fences) {
					await registerFences(config, updateConfig, logger);
				}

				await ensureReactRenderer(config, updateConfig, logger);

				// `command` is only available here, not in `astro:config:done` — and
				// this must stay build-only; see `loadLikeC4` in ./fences.ts.
				if (command === 'build') {
					await preloadLikeC4();
				}
			},
		},
	};
}

/**
 * Add `@astrojs/react` when the site has not.
 *
 * The islands are `client:only="react"`, so without a React renderer
 * `<LikeC4View>` fails at build with Astro's generic "no renderer" error, which
 * mentions React but not this package. `@astrojs/react` is a peer dependency, so
 * it is installed; adding it here is the difference between
 * `astro add @purview-dev/astroc4` producing a working site and producing one
 * that builds until the first diagram.
 *
 * Pushed integrations have their hooks run after this one — Astro's config loop
 * reads integrations added while it runs, which is how Starlight adds Expressive
 * Code — so the renderer registers in the same pass.
 *
 * Not added, on purpose: `@astrojs/mdx` (it changes what content types a site
 * has) and `astro-expressive-code` (it takes over every code block on the site).
 * Both are the site's decision; the [docs](docs/wiki/guide/Plain-Astro.md) say
 * what to install, and a fence in a `.md` page says what is missing.
 */
async function ensureReactRenderer(
	config: AstroConfig,
	updateConfig: (config: Record<string, unknown>) => void,
	logger: AstroIntegrationLogger,
): Promise<void> {
	if (config.integrations.some((integration) => integration.name === '@astrojs/react')) return;

	try {
		const { default: react } = await import('@astrojs/react');

		updateConfig({ integrations: [react()] });
		logger.info('added @astrojs/react: the LikeC4 diagrams are React islands (client:only="react").');
	} catch {
		logger.warn(
			'@astrojs/react is not installed, so <LikeC4View> cannot render. Install it (`astro add react`).',
		);
	}
}

/**
 * Append the fence transform to the site's existing Sätteri processor, keeping
 * whatever Astro and other integrations already registered on it.
 *
 * Warnings go through Astro's logger, not `console`: the logger honours the log
 * level the site ran the CLI with, and `fork()` labels the message with the part
 * of this package that produced it (`[likec4-fences]`), which is what the
 * Troubleshooting page quotes.
 */
async function registerFences(
	config: AstroConfig,
	updateConfig: (config: Record<string, unknown>) => void,
	logger: AstroIntegrationLogger,
): Promise<void> {
	const { satteri, isSatteriProcessor } = await import('@astrojs/markdown-satteri');
	const existing = config.markdown?.processor;
	const fences = () => {
		const fenceLogger = logger.fork('likec4-fences');

		return likec4Fences({
			reporter: { warn: (message) => fenceLogger.warn(message) },
			// Whether the advice "rename the page to .mdx" can actually work.
			mdx: config.integrations.some((integration) => integration.name === '@astrojs/mdx'),
		});
	};

	// No processor configured means Astro's default, which is Sätteri — also true
	// outside Starlight.
	if (existing === undefined) {
		updateConfig({ markdown: { processor: satteri({ mdastPlugins: [fences()] }) } });
		return;
	}

	if (!isSatteriProcessor(existing)) {
		logger.warn(
			'```likec4 fences are disabled: the site is not using the Sätteri Markdown processor. ' +
				'<LikeC4View /> still works.',
		);
		return;
	}

	const existingOptions = existing.options ?? {};

	updateConfig({
		markdown: {
			processor: satteri({
				...existingOptions,
				mdastPlugins: [...(existingOptions.mdastPlugins ?? []), fences()],
			}),
		},
	});
}

export default likec4Integration;
