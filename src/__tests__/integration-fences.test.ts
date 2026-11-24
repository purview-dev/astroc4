import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AstroIntegration } from 'astro';
import { afterEach, describe, expect, it, vi } from 'vitest';

const likec4Fences = vi.hoisted(() => vi.fn((_options?: unknown) => () => null));

// Only `likec4Fences` is replaced, so the integration loads LikeC4's Node API
// and the `file=` layout plugin exactly as it does in a build.
vi.mock('../fences.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../fences.ts')>()),
	likec4Fences,
}));

import { likec4Integration, type LikeC4IntegrationOptions } from '../integration.ts';
import starlightLikeC4 from '../index.ts';
import type { ValidationOptions } from '../validation.ts';

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

/** `vitePlugin.workspace` keeps project discovery out, so the test touches no files. */
async function setup(options: LikeC4IntegrationOptions = {}, root: URL = pathToFileURL(process.cwd())) {
	const logger = stubLogger();

	await likec4Integration({ vitePlugin: { workspace: 'diagrams' }, ...options }).hooks['astro:config:setup']!({
		command: 'dev',
		config: { root, vite: {}, integrations: [] },
		updateConfig: vi.fn(),
		injectScript: vi.fn(),
		logger,
	} as never);

	return { logger };
}

type FenceOptions = {
	validation?: ValidationOptions;
	onInvalid?: (message: string) => void;
	markers?: false | { root: string };
	onMarkerFallback?: (message: string) => void;
};

/** The options the integration handed the fence transform on its last call. */
function lastFenceOptions(): FenceOptions {
	const calls = likec4Fences.mock.calls as unknown as [FenceOptions][];

	return calls.at(-1)![0];
}

describe('fence validation through the integration', () => {
	it('leaves validation strict by default', async () => {
		await setup();

		expect(lastFenceOptions().validation).toBeUndefined();
	});

	it('passes the validation option through to the fence transform', async () => {
		await setup({ validation: 'relaxed' });

		expect(lastFenceOptions()).toMatchObject({ validation: 'relaxed' });
	});

	it('routes a skipped fence through the Astro logger, so the build warns instead of failing', async () => {
		const { logger } = await setup({ validation: { relaxed: ['tutorials/**'] } });

		lastFenceOptions().onInvalid?.('page.mdx: ```likec4 fence is not valid LikeC4');

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not valid LikeC4'));
	});
});

describe('markers option through the integration', () => {
	let tmpRoot: string | undefined;

	afterEach(async () => {
		if (tmpRoot) {
			await rm(tmpRoot, { recursive: true, force: true });
			tmpRoot = undefined;
		}
	});

	it('defaults to the repository root above the site, when `.git` sits above it', async () => {
		tmpRoot = await mkdtemp(join(tmpdir(), 'astroc4-integration-markers-'));
		await mkdir(join(tmpRoot, '.git'));
		const astroRoot = join(tmpRoot, 'site');
		await mkdir(astroRoot);

		await setup({}, pathToFileURL(astroRoot));

		expect(lastFenceOptions().markers).toEqual({ root: tmpRoot });
	});

	it('turns markers off', async () => {
		await setup({ markers: false });

		expect(lastFenceOptions().markers).toBe(false);
	});

	it('resolves an object `root` against the site root', async () => {
		tmpRoot = await mkdtemp(join(tmpdir(), 'astroc4-integration-markers-'));
		const astroRoot = join(tmpRoot, 'site');
		await mkdir(astroRoot);

		await setup({ markers: { root: '..' } }, pathToFileURL(astroRoot));

		expect(lastFenceOptions().markers).toEqual({ root: tmpRoot });
	});

	it('routes a marker fallback through the Astro logger', async () => {
		const { logger } = await setup();

		lastFenceOptions().onMarkerFallback?.('page.md:3: purview:likec4 marker kept its fallback — reason');

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('kept its fallback'));
	});

	it('forwards the option through the Starlight plugin', async () => {
		const addIntegration = vi.fn();

		const plugin = starlightLikeC4({ markers: false, highlighting: false });

		await plugin.hooks['config:setup']!({
			config: { expressiveCode: undefined },
			astroConfig: { root: pathToFileURL(process.cwd()) },
			updateConfig: vi.fn(),
			addIntegration,
			logger: stubLogger(),
			command: 'dev',
		} as never);

		const integration = addIntegration.mock.calls[0]?.[0] as AstroIntegration;

		await integration.hooks['astro:config:setup']!({
			command: 'dev',
			config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [] },
			updateConfig: vi.fn(),
			injectScript: vi.fn(),
			logger: stubLogger(),
		} as never);

		expect(lastFenceOptions().markers).toBe(false);
	});
});
