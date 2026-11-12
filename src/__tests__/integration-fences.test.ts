import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const likec4Fences = vi.hoisted(() => vi.fn((_options?: unknown) => () => null));

// Only `likec4Fences` is replaced, so the integration loads LikeC4's Node API
// and the `file=` layout plugin exactly as it does in a build.
vi.mock('../fences.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../fences.ts')>()),
	likec4Fences,
}));

import { likec4Integration, type LikeC4IntegrationOptions } from '../integration.ts';
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
async function setup(options: LikeC4IntegrationOptions = {}) {
	const logger = stubLogger();

	await likec4Integration({ vitePlugin: { workspace: 'diagrams' }, ...options }).hooks['astro:config:setup']!({
		command: 'dev',
		config: { root: pathToFileURL(process.cwd()), vite: {}, integrations: [] },
		updateConfig: vi.fn(),
		injectScript: vi.fn(),
		logger,
	} as never);

	return { logger };
}

type FenceOptions = { validation?: ValidationOptions; onInvalid?: (message: string) => void };

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
