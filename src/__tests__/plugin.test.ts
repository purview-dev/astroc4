import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import starlightLikeC4, { withLikeC4Language } from '../index.js';
import { translations } from '../translations.js';

/** A registration as the plugin builds it. */
const registration = { name: 'likec4', scopeName: 'source.likec4', aliases: ['c4'] };

/** Run the plugin's `config:setup` hook against a stubbed Starlight context. */
async function setup(options: Parameters<typeof starlightLikeC4>[0] = {}) {
	const root = pathToFileURL(await mkdtemp(join(tmpdir(), 'astroc4-plugin-')));
	const plugin = starlightLikeC4({ highlighting: { offline: true }, ...options });

	const updateConfig = vi.fn();
	const addIntegration = vi.fn();
	const logger = { info: vi.fn(), warn: vi.fn() };

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
