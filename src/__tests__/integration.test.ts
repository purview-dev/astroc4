import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import likec4Integration, {
	likec4Integration as namedIntegration,
	missingOptimizedDependencies,
	PACKAGE_NAME,
	type LikeC4IntegrationOptions,
} from '../integration.js';

/** The slice of `AstroIntegrationLogger` the integration uses, with spies. */
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

/** Run the integration's `astro:config:setup` hook against a stubbed context. */
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
		logger,
	} as never);

	return { logger, updateConfig };
}

/** The `vite` option the integration handed to Astro. */
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

		// LikeC4's plugin, the one serving `virtual:astroc4/projects`, and the
		// one rewriting and serving local icons.
		expect(vite.plugins).toHaveLength(3);
		expect(vite.plugins[1].name).toBe(`${PACKAGE_NAME}/projects`);
		expect(vite.plugins[2].name).toBe(`${PACKAGE_NAME}/icons`);
		expect(vite.ssr).toEqual({ noExternal: [PACKAGE_NAME] });
		expect(vite.optimizeDeps).toEqual({ include: ['react/compiler-runtime'] });
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
