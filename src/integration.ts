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
import type { Plugin as VitePlugin } from 'vite';

import { likec4Fences, preloadLikeC4 } from './fences.js';
import { fileLayoutPlugin } from './file-layout.js';
import { astroc4IconPlugin, type Astroc4IconPlugin } from './icon-plugin.js';
import { discoverProjects, resolveProjects, type ResolvedProject } from './projects.js';
import { prepareWorkspace, PROJECTS_MODULE_ID, projectsModule } from './workspace.js';

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
	/**
	 * Named LikeC4 projects, compiled alongside those discovered under the site
	 * root: `{ architecture: '../../docs/architecture/likec4' }`. Each folder
	 * holds a `likec4.config.json` and may be relative to the site root or
	 * absolute; the key is the name `<LikeC4View project="…">` uses.
	 */
	projects?: Record<string, string>;
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
 * Mounts the diagrams of ```likec4 fences in .md pages (see `fencePlaceholder`).
 *
 * Injected into every page, so it only looks: React and LikeC4 are loaded with
 * a dynamic `import()` on a page that has a placeholder, never on one without.
 * `astro:page-load` covers sites using view transitions.
 */
const MD_FENCES_SCRIPT = [
	`const mountLikeC4Fences = () => {`,
	`  if (!document.querySelector('[data-astroc4-fence]:not([data-astroc4-mounted])')) return;`,
	`  import('${PACKAGE_NAME}/components/md-fences').then((module) => module.mountFences());`,
	`};`,
	`if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLikeC4Fences);`,
	`else mountLikeC4Fences();`,
	`document.addEventListener('astro:page-load', mountLikeC4Fences);`,
].join('\n');

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
	projects,
	fences = true,
}: LikeC4IntegrationOptions = {}): AstroIntegration {
	// Created in `astro:config:setup`, read again when the build is done.
	let icons: Astroc4IconPlugin | undefined;

	return {
		name: `${PACKAGE_NAME}/integration`,
		hooks: {
			'astro:config:setup': async ({ command, config, updateConfig, injectScript, logger }) => {
				const root = fileURLToPath(config.root);
				const optimizeDeps = missingOptimizedDependencies(config.vite?.optimizeDeps?.include, root);
				const { pluginOptions, resolved, stagingDir } = await workspaceFor(root, vitePlugin, projects, logger);

				icons = astroc4IconPlugin({ projects: resolved, base: config.base ?? '/', siteRoot: root, stagingDir });

				updateConfig({
					vite: {
						plugins: [LikeC4VitePlugin(pluginOptions), projectsPlugin(resolved), icons, fileLayoutPlugin()],
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
					// .md pages cannot hold the diagram components, so their fences are
					// placeholders; this mounts them. It costs nothing on a page without one.
					injectScript('page', MD_FENCES_SCRIPT);
				}

				await ensureReactRenderer(config, updateConfig, logger);

				// `command` is only available here, not in `astro:config:done` — and
				// this must stay build-only; see `loadLikeC4` in ./fences.ts.
				if (command === 'build') {
					await preloadLikeC4();
				}
			},
			// Every icon the compiled models referenced, at the URL they now name.
			'astro:build:done': async ({ dir }) => {
				await icons?.emit(fileURLToPath(dir));
			},
		},
	};
}

/**
 * The options `LikeC4VitePlugin` gets, and the projects the site can name.
 *
 * With `projects`, configured and discovered projects are linked into one
 * staging workspace, because the plugin compiles a single folder. Without it,
 * LikeC4 discovers under the site root exactly as before, and the discovered
 * projects are only listed so components can name them. An explicit
 * `vitePlugin.workspace` is the site taking over discovery itself, so it wins.
 */
async function workspaceFor(
	root: string,
	vitePlugin: NonNullable<LikeC4IntegrationOptions['vitePlugin']>,
	configured: Record<string, string> | undefined,
	logger: AstroIntegrationLogger,
): Promise<{
	pluginOptions: NonNullable<LikeC4IntegrationOptions['vitePlugin']>;
	resolved: ResolvedProject[];
	stagingDir?: string;
}> {
	const hasConfigured = configured !== undefined && Object.keys(configured).length > 0;

	// A site handing over its own language services, or its own workspace, has
	// taken discovery over.
	if (vitePlugin.workspace !== undefined || 'languageServices' in vitePlugin) {
		if (hasConfigured) {
			logger.warn(
				'`projects` is ignored because `vitePlugin.workspace` or `vitePlugin.languageServices` is set; remove one of them.',
			);
		}

		return { pluginOptions: vitePlugin, resolved: [] };
	}

	const discovered = await discoverProjects(root);

	if (!hasConfigured) {
		return { pluginOptions: vitePlugin, resolved: discovered };
	}

	const resolved = await resolveProjects({ root, configured, discovered });
	const workspace = await prepareWorkspace(resolved, join(root, '.astro', 'astroc4'));

	// Narrowed above: this branch never carries `languageServices`.
	return { pluginOptions: { ...(vitePlugin as { workspace?: string }), workspace }, resolved, stagingDir: workspace };
}

/** Serves `virtual:astroc4/projects`: the names components may pass as `project`. */
function projectsPlugin(projects: ResolvedProject[]): VitePlugin {
	const resolvedId = `\0${PROJECTS_MODULE_ID}`;

	return {
		name: `${PACKAGE_NAME}/projects`,
		resolveId: (id) => (id === PROJECTS_MODULE_ID ? resolvedId : undefined),
		load: (id) => (id === resolvedId ? projectsModule(projects) : undefined),
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
 */
async function registerFences(
	config: AstroConfig,
	updateConfig: (config: Record<string, unknown>) => void,
	logger: AstroIntegrationLogger,
): Promise<void> {
	const { satteri, isSatteriProcessor } = await import('@astrojs/markdown-satteri');
	const existing = config.markdown?.processor;
	// A fence's `file="…"` must stay inside the site.
	const fences = () => likec4Fences({ root: fileURLToPath(config.root) });

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
