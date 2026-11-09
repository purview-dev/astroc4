import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import likec4Integration, {
	likec4Integration as namedIntegration,
	missingOptimizedDependencies,
	PACKAGE_NAME,
	type LikeC4IntegrationOptions,
} from '../integration.ts';

interface StubLogger {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	fork: ReturnType<typeof vi.fn>;
}

function stubLogger(): StubLogger {
	const logger: StubLogger = { info: vi.fn(), warn: vi.fn(), fork: vi.fn() };

	logger.fork.mockImplementation(() => logger);

	return logger;
}

async function setup(
	options: LikeC4IntegrationOptions = {},
	vite: Record<string, unknown> = {},
	integrations: { name: string }[] = [],
) {
	const updateConfig = vi.fn();
	const logger = stubLogger();

	await likec4Integration(options).hooks['astro:config:setup']!({
		command: 'dev',
		// `process.cwd()` is the repository root, so React resolves — the same
		// condition a real site meets.
		config: { root: pathToFileURL(process.cwd()), vite, integrations },
		updateConfig,
		injectScript: vi.fn(),
		logger,
	} as never);

	return { logger, updateConfig };
}

const viteOf = (updateConfig: ReturnType<typeof vi.fn>): Record<string, any> =>
	(updateConfig.mock.calls[0]?.[0] as { vite: Record<string, any> }).vite;

describe('likec4Integration', () => {
	it('is the default export, so a plain Astro site can import it by itself', () => {
		expect(namedIntegration).toBe(likec4Integration);

		const integration = likec4Integration();

		expect(integration.name).toBe(`${PACKAGE_NAME}/integration`);
		expect(typeof integration.hooks['astro:config:setup']).toBe('function');
	});

	it('installs the LikeC4 Vite plugin and the SSR exception the components need', async () => {
		const { updateConfig } = await setup();

		const vite = viteOf(updateConfig);

		// LikeC4's plugin, the one serving `virtual:astroc4/projects`, the one
		// rewriting and serving local icons, and the one compiling `file=` views.
		expect(vite.plugins).toHaveLength(4);
		expect(vite.plugins[1].name).toBe(`${PACKAGE_NAME}/projects`);
		expect(vite.plugins[2].name).toBe(`${PACKAGE_NAME}/icons`);
		expect(vite.plugins[3].name).toBe(`${PACKAGE_NAME}/file-layout`);
		expect(vite.ssr).toEqual({ noExternal: [PACKAGE_NAME] });
		expect(vite.optimizeDeps).toEqual({ include: ['react/compiler-runtime'] });
	});

	it('injects a page script that mounts .md fences only on pages that have one', async () => {
		const injectScript = vi.fn();
		const updateConfig = vi.fn();
		const logger = stubLogger();

		await likec4Integration().hooks['astro:config:setup']!({
			command: 'dev',
			config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [] },
			updateConfig,
			injectScript,
			logger,
		} as never);

		expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('[data-astroc4-fence]'));
		expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining(`import('${PACKAGE_NAME}/components/md-fences')`));
	});

	// In dev, @astrojs/react installs the fast-refresh preamble only on pages with an
	// island, and a .md page has none: React components then throw "can't detect preamble".
	it('installs the React preamble before it loads the .md fence components', async () => {
		const injectScript = vi.fn();

		await likec4Integration().hooks['astro:config:setup']!({
			command: 'dev',
			config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [] },
			updateConfig: vi.fn(),
			injectScript,
			logger: stubLogger(),
		} as never);

		const script: string = injectScript.mock.calls.find(([stage]) => stage === 'page')![1];
		const preamble = script.indexOf(`import('@vitejs/plugin-react/preamble')`);

		expect(preamble).toBeGreaterThan(-1);
		expect(preamble).toBeLessThan(script.indexOf(`import('${PACKAGE_NAME}/components/md-fences')`));
	});

	it('registers the fence transform with the site Markdown processor', async () => {
		const { updateConfig } = await setup();

		// The first call is the Vite config; the second replaces `markdown`.
		const { markdown } = updateConfig.mock.calls[1]?.[0] as { markdown: { processor: unknown } };

		expect(markdown.processor).toBeDefined();
	});

	it('leaves the Markdown processor alone when fences are off', async () => {
		const { updateConfig } = await setup({ fences: false });

		for (const [config] of updateConfig.mock.calls as [Record<string, any>][]) {
			expect(config).not.toHaveProperty('markdown');
		}
	});

	it('adds @astrojs/react when the site has no React renderer', async () => {
		// `client:only="react"` renders nothing without one, and Astro's error for
		// that names React, not this package.
		const { logger, updateConfig } = await setup();

		const added = (updateConfig.mock.calls as [Record<string, any>][])
			.map(([config]) => config.integrations ?? [])
			.flat()
			.find((integration: { name?: string }) => integration.name === '@astrojs/react');

		expect(added).toBeDefined();
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('@astrojs/react'));
	});

	it('does not add a renderer the site already registered', async () => {
		const { updateConfig } = await setup({}, {}, [{ name: '@astrojs/react' }]);

		const integrations = (updateConfig.mock.calls as [Record<string, any>][])
			.map(([config]) => config.integrations ?? [])
			.flat();

		expect(integrations).toEqual([]);
	});

	it('sets no Starlight-only option, because Astro has none', async () => {
		const { updateConfig } = await setup();

		for (const [config] of updateConfig.mock.calls as [Record<string, unknown>][]) {
			expect(config).not.toHaveProperty('expressiveCode');
		}
	});

	it('keeps the site’s own optimized dependencies', async () => {
		const { updateConfig } = await setup({}, { optimizeDeps: { include: ['gsap'] } });

		expect(viteOf(updateConfig).optimizeDeps).toEqual({ include: ['react/compiler-runtime'] });
		expect(missingOptimizedDependencies(['gsap'], process.cwd())).toEqual(['react/compiler-runtime']);
	});
});
