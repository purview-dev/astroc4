import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { AstroIntegration } from 'astro';
import { describe, expect, it, vi } from 'vitest';

import starlightLikeC4, { missingOptimizedDependencies, withLikeC4Language } from '../index.js';
import { translations } from '../translations.js';

/** A registration as the plugin builds it. */
const registration = { name: 'likec4', scopeName: 'source.likec4', aliases: ['c4'] };

/** The slice of `AstroIntegrationLogger` the plugin uses, with spies. */
interface StubLogger {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	fork: ReturnType<typeof vi.fn>;
}

/**
 * `fork(label)` keeps Astro's label-swapping behaviour without losing the
 * spies: every fork returns the same stub, so an assertion on `warn` sees
 * messages logged through a fork too.
 */
function stubLogger(): StubLogger {
	const logger: StubLogger = { info: vi.fn(), warn: vi.fn(), fork: vi.fn() };

	logger.fork.mockImplementation(() => logger);

	return logger;
}

/** Run the plugin's `config:setup` hook against a stubbed Starlight context. */
async function setup(options: Parameters<typeof starlightLikeC4>[0] = {}) {
	const root = pathToFileURL(await mkdtemp(join(tmpdir(), 'astroc4-plugin-')));
	const plugin = starlightLikeC4({ highlighting: { offline: true }, ...options });

	const updateConfig = vi.fn();
	const addIntegration = vi.fn();
	const logger = stubLogger();

	const context = {
		config: { expressiveCode: undefined },
		astroConfig: { root },
		updateConfig,
		addIntegration,
		logger,
		command: 'dev',
	} as unknown as Parameters<NonNullable<typeof plugin.hooks['config:setup']>>[0];

	await plugin.hooks['config:setup']!(context);

	return { addIntegration, logger, updateConfig };
}

/**
 * Run the integration's `astro:config:setup` hook — the one that owns the Vite
 * config — against a stubbed Astro context, with fences off so nothing else
 * touches the Markdown processor.
 */
async function setupVite(root: URL, vite: Record<string, unknown> = {}) {
	const { addIntegration } = await setup({ fences: false });
	const integration = addIntegration.mock.calls[0]?.[0] as AstroIntegration;
	const updateConfig = vi.fn();

	await integration.hooks['astro:config:setup']!({
		command: 'dev',
		config: { root, vite, integrations: [] },
		updateConfig,
		logger: stubLogger(),
	} as never);

	return updateConfig;
}

/** The `vite` option the integration handed to Astro. */
function viteOf(updateConfig: ReturnType<typeof vi.fn>): Record<string, any> {
	return (updateConfig.mock.calls[0]?.[0] as { vite: Record<string, any> }).vite;
}

describe('starlightLikeC4', () => {
	it('adds the bridge to the LikeC4 Vite plugin', async () => {
		const { addIntegration } = await setup();

		expect(addIntegration).toHaveBeenCalledTimes(1);
		expect(addIntegration.mock.calls[0]?.[0]).toMatchObject({ name: '@purview-dev/astroc4/integration' });
	});

	it('registers the grammar with the site Expressive Code, with no ec.config.mjs', async () => {
		const { updateConfig, logger } = await setup();

		expect(updateConfig).toHaveBeenCalledTimes(1);

		const { expressiveCode } = updateConfig.mock.calls[0]?.[0] as { expressiveCode: any };
		const langs = expressiveCode.shiki.langs;

		expect(langs).toHaveLength(1);
		expect(langs[0]).toMatchObject({ name: 'likec4', scopeName: 'source.likec4', aliases: ['c4'] });
		expect(langs[0].repository.keywords.patterns.length).toBeGreaterThan(3);

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('LikeC4 grammar likec4/likec4@'));
	});

	it('keeps the options and languages the site already had', async () => {
		const plugin = starlightLikeC4({ highlighting: { offline: true } });
		const root = pathToFileURL(await mkdtemp(join(tmpdir(), 'astroc4-plugin-')));
		const updateConfig = vi.fn();

		await plugin.hooks['config:setup']!({
			config: {
				expressiveCode: { themes: ['night-owl-dark'], shiki: { langs: ['ts'] }, styleOverrides: { borderRadius: '4px' } },
			},
			astroConfig: { root },
			updateConfig,
			addIntegration: vi.fn(),
			logger: { info: vi.fn(), warn: vi.fn() },
			command: 'dev',
		} as unknown as Parameters<NonNullable<typeof plugin.hooks['config:setup']>>[0]);

		const { expressiveCode } = updateConfig.mock.calls[0]?.[0] as { expressiveCode: any };

		expect(expressiveCode.themes).toEqual(['night-owl-dark']);
		expect(expressiveCode.styleOverrides).toEqual({ borderRadius: '4px' });
		expect(expressiveCode.shiki.langs).toHaveLength(2);
		expect(expressiveCode.shiki.langs[0]).toBe('ts');
	});

	it('warns instead of pretending when the site disabled Expressive Code', async () => {
		const { updateConfig, logger } = await setup();

		logger.warn.mockClear();
		updateConfig.mockClear();

		const plugin = starlightLikeC4({ highlighting: { offline: true } });

		await plugin.hooks['config:setup']!({
			config: { expressiveCode: false },
			astroConfig: { root: pathToFileURL(await mkdtemp(join(tmpdir(), 'astroc4-plugin-'))) },
			updateConfig,
			addIntegration: vi.fn(),
			logger,
			command: 'dev',
		} as unknown as Parameters<NonNullable<typeof plugin.hooks['config:setup']>>[0]);

		expect(updateConfig).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('expressiveCode: false'));
	});

	it('does nothing at all when highlighting is turned off', async () => {
		const { updateConfig } = await setup({ highlighting: false });

		expect(updateConfig).not.toHaveBeenCalled();
	});

	it('injects the UI translations', () => {
		const plugin = starlightLikeC4();
		const injectTranslations = vi.fn();

		plugin.hooks['i18n:setup']!({ injectTranslations } as never);

		expect(injectTranslations).toHaveBeenCalledWith(translations);
	});
});

describe('astro add', () => {
	it('is also an Astro integration, so `astro add`’s `integrations: [astroc4()]` works', async () => {
		// The CLI reads only npm metadata and the default export, and writes
		// `astroc4()` into `integrations`. Starlight never calls `astro:*` hooks and
		// Astro never calls `config:setup`, so one object can serve both.
		const plugin = starlightLikeC4({ highlighting: { offline: true } });
		const updateConfig = vi.fn();

		await plugin.hooks['astro:config:setup']!({
			command: 'dev',
			config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [] },
			updateConfig,
			injectScript: vi.fn(),
			logger: stubLogger(),
		} as never);

		const { vite } = updateConfig.mock.calls[0]?.[0] as { vite: Record<string, unknown> };

		expect(vite.ssr).toEqual({ noExternal: ['@purview-dev/astroc4'] });
		expect(vite.optimizeDeps).toEqual({ include: ['react/compiler-runtime'] });
	});

	it('warns when the CLI wires it into a Starlight site, where only half of it can run', async () => {
		const plugin = starlightLikeC4({ highlighting: { offline: true } });
		const logger = stubLogger();

		await plugin.hooks['astro:config:setup']!({
			command: 'dev',
			config: {
				root: pathToFileURL(process.cwd()),
				vite: {},
				integrations: [{ name: '@astrojs/starlight' }],
			},
			updateConfig: vi.fn(),
			injectScript: vi.fn(),
			logger,
		} as never);

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('starlight({ plugins: [astroc4()] })'));
	});

	it('stays quiet on a plain Astro site, where that is the supported shape', async () => {
		const plugin = starlightLikeC4({ highlighting: { offline: true } });
		const logger = stubLogger();

		await plugin.hooks['astro:config:setup']!({
			command: 'dev',
			config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [{ name: '@astrojs/mdx' }] },
			updateConfig: vi.fn(),
			injectScript: vi.fn(),
			logger,
		} as never);

		expect(logger.warn).not.toHaveBeenCalled();
	});
});

describe('.md fences', () => {
	it('the Starlight plugin injects the script that mounts them', async () => {
		// A fence in a .md page renders, rather than warning; the injected page
		// script mounts its placeholder (see fences.test.ts and md-fences.tsx).
		const { addIntegration } = await setup();
		const integration = addIntegration.mock.calls[0]?.[0] as AstroIntegration;
		const injectScript = vi.fn();

		await integration.hooks['astro:config:setup']!({
			command: 'dev',
			config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [] },
			updateConfig: vi.fn(),
			injectScript,
			logger: stubLogger(),
		} as never);

		expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('[data-astroc4-fence]'));
	});
});

describe('react/compiler-runtime', () => {
	// `likec4/react` is compiled with the React Compiler and imports `c` from
	// `react/compiler-runtime`, which React 19 ships as CommonJS. Unoptimized,
	// dev serves it raw and the island throws
	// "does not provide an export named 'c'" instead of hydrating.
	it('pre-bundles it so the island can hydrate in dev', async () => {
		const updateConfig = await setupVite(pathToFileURL(process.cwd()));

		expect(viteOf(updateConfig).optimizeDeps).toEqual({ include: ['react/compiler-runtime'] });
	});

	it('adds nothing when the site already optimises it, because Astro concatenates', async () => {
		const updateConfig = await setupVite(pathToFileURL(process.cwd()), {
			optimizeDeps: { include: ['react/compiler-runtime'], exclude: ['@purview-dev/astroc4'] },
		});

		// Re-sending the site's list would duplicate it: `updateConfig` merges
		// `vite` with Vite's `mergeConfig`, which concatenates arrays.
		expect(viteOf(updateConfig).optimizeDeps).toBeUndefined();
	});

	it('leaves the rest of the Vite config alone', async () => {
		const updateConfig = await setupVite(pathToFileURL(process.cwd()), {
			optimizeDeps: { include: ['gsap'] },
			resolve: { dedupe: ['react'] },
		});

		const vite = viteOf(updateConfig);

		expect(vite.resolve).toBeUndefined();
		expect(vite.optimizeDeps).toEqual({ include: ['react/compiler-runtime'] });
	});

	it('does not name a dependency the site cannot resolve', async () => {
		const root = pathToFileURL(await mkdtemp(join(tmpdir(), 'astroc4-no-react-')));

		expect(missingOptimizedDependencies(undefined, fileURLToPath(root))).toEqual([]);
	});
});

describe('missingOptimizedDependencies', () => {
	const root = process.cwd();

	it('returns the entry a site without one needs', () => {
		expect(missingOptimizedDependencies(undefined, root)).toEqual(['react/compiler-runtime']);
		expect(missingOptimizedDependencies([], root)).toEqual(['react/compiler-runtime']);
	});

	it('skips an entry the site already lists, without touching the others', () => {
		expect(missingOptimizedDependencies(['gsap', 'react/compiler-runtime'], root)).toEqual([]);
	});

	it('tolerates an `include` that is not a list', () => {
		expect(missingOptimizedDependencies('react/compiler-runtime', root)).toEqual(['react/compiler-runtime']);
	});
});

describe('withLikeC4Language', () => {
	it('creates the shiki options when the site has none', () => {
		expect(withLikeC4Language(undefined, registration)).toEqual({ shiki: { langs: [registration] } });
	});

	it('appends to the languages the site already has', () => {
		const expressiveCode = { shiki: { langs: ['ts', 'bash'] }, themes: ['x'] };

		expect(withLikeC4Language(expressiveCode, registration)).toEqual({
			shiki: { langs: ['ts', 'bash', registration] },
			themes: ['x'],
		});
	});

	it('replaces a LikeC4 language rather than adding a second one', () => {
		const ours = { name: 'likec4', scopeName: 'source.likec4', aliases: [] };
		const stale = { name: 'likec4', scopeName: 'source.likec4', aliases: [] };

		expect(withLikeC4Language({ shiki: { langs: ['ts', stale] } }, ours).shiki.langs).toEqual(['ts', ours]);
		expect(withLikeC4Language({ shiki: { langs: ['c4'] } }, ours).shiki.langs).toEqual([ours]);
	});

	it('does not mutate the options it was given', () => {
		const expressiveCode = { shiki: { langs: ['ts'] } };

		withLikeC4Language(expressiveCode, registration);

		expect(expressiveCode.shiki.langs).toEqual(['ts']);
	});
});
