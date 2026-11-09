import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroConfig, AstroIntegration, AstroIntegrationLogger } from 'astro';
import { LikeC4VitePlugin } from 'likec4/vite-plugin';
import type { Plugin as VitePlugin } from 'vite';

import { likec4Fences, preloadLikeC4 } from './fences.ts';
import { fileLayoutPlugin } from './file-layout.ts';
import { astroc4IconPlugin, type Astroc4IconPlugin } from './icon-plugin.ts';
import { discoverProjects, resolveProjects, type ResolvedProject } from './projects.ts';
import { prepareWorkspace, PROJECTS_MODULE_ID, projectsModule } from './workspace.ts';

/** Scoped because npm refuses the unscoped `astroc4` as too similar to `astro`. */
export const PACKAGE_NAME = '@purview-dev/astroc4';

export interface LikeC4IntegrationOptions {
	/**
	 * Passed through to `LikeC4VitePlugin`. Setting `workspace` or
	 * `languageServices` takes project discovery over, and `projects` is ignored.
	 */
	vitePlugin?: Parameters<typeof LikeC4VitePlugin>[0];
	/**
	 * Named LikeC4 projects, compiled alongside those discovered under the site
	 * root: `{ architecture: '../../docs/architecture/likec4' }`. Folders are
	 * relative to the site root or absolute.
	 */
	projects?: Record<string, string>;
	/** Render ```likec4 fences in .md and .mdx pages as diagrams. Defaults to `true`. */
	fences?: boolean;
}

/**
 * `likec4/react` is built with the React Compiler and imports `c` from
 * `react/compiler-runtime`, which React 19 ships as CommonJS. Unless Vite
 * pre-bundles it, `astro dev` serves it raw and every island fails with
 * "does not provide an export named 'c'" — while `astro build` stays green.
 */
const OPTIMIZED_DEPENDENCIES = ['react/compiler-runtime'];

/**
 * Mounts the fences of .md pages. Injected into every page, so React and LikeC4
 * are only `import()`ed on a page that has a placeholder.
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
 * The `optimizeDeps.include` entries the site still lacks. Only missing ones:
 * Vite's `mergeConfig` concatenates arrays. Unresolvable ones are skipped, since
 * naming a package Vite cannot find breaks the optimizer.
 */
export function missingOptimizedDependencies(include: unknown, root: string): string[] {
	const existing = Array.isArray(include) ? include : [];

	return OPTIMIZED_DEPENDENCIES.filter(
		(dependency) => !existing.includes(dependency) && resolvesFrom(dependency, root),
	);
}

// Walks node_modules as Vite does: under Bun, `createRequire` also finds
// packages in Bun's global cache, which Vite never looks in.
function resolvesFrom(specifier: string, root: string): boolean {
	const name = specifier.split('/', specifier.startsWith('@') ? 2 : 1).join('/');

	for (let dir = resolve(root); ; dir = dirname(dir)) {
		if (existsSync(join(dir, 'node_modules', name, 'package.json'))) return true;
		if (dirname(dir) === dir) return false;
	}
}

export function likec4Integration({
	vitePlugin = {},
	projects,
	fences = true,
}: LikeC4IntegrationOptions = {}): AstroIntegration {
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
						// The components ship as .astro/.tsx source for Vite to transform.
						ssr: { noExternal: [PACKAGE_NAME] },
						...(optimizeDeps.length > 0 ? { optimizeDeps: { include: optimizeDeps } } : {}),
					},
				});

				if (fences) {
					await registerFences(config, updateConfig, logger, resolved);
					injectScript('page', MD_FENCES_SCRIPT);
				}

				await ensureReactRenderer(config, updateConfig, logger);

				// Build only: loading LikeC4 eagerly in dev restarts the server (see ./fences.ts).
				if (command === 'build') {
					await preloadLikeC4();
				}
			},
			'astro:build:done': async ({ dir }) => {
				await icons?.emit(fileURLToPath(dir));
			},
		},
	};
}

/**
 * The options `LikeC4VitePlugin` gets, and the projects pages can name. With
 * `projects`, every project is linked into one staging workspace, because the
 * plugin compiles a single folder.
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
 * Add `@astrojs/react` when the site has not: without a renderer the
 * `client:only="react"` islands fail with Astro's generic "no renderer" error.
 * Integrations pushed here still have their hooks run in this pass. MDX and
 * Expressive Code are left to the site, because they change its content types
 * and code blocks.
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

/** Append the fence transform to the site's Sätteri processor, keeping its plugins. */
async function registerFences(
	config: AstroConfig,
	updateConfig: (config: Record<string, unknown>) => void,
	logger: AstroIntegrationLogger,
	projects: ResolvedProject[],
): Promise<void> {
	const { satteri, isSatteriProcessor } = await import('@astrojs/markdown-satteri');
	const existing = config.markdown?.processor;
	const fences = () =>
		likec4Fences({
			root: fileURLToPath(config.root),
			// Empty when the site took discovery over: then only the browser knows.
			projects: projects.length > 0 ? projects.map((project) => project.name) : undefined,
		});

	// No processor configured means Astro's default, which is Sätteri.
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
