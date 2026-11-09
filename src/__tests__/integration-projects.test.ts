import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const likec4VitePlugin = vi.hoisted(() => vi.fn((_options?: unknown) => ({ name: 'likec4-stub' })));

vi.mock('likec4/vite-plugin', () => ({ LikeC4VitePlugin: likec4VitePlugin }));

import { likec4Integration, type LikeC4IntegrationOptions } from '../integration.js';
import { PROJECTS_MODULE_ID } from '../workspace.js';

async function folderWithConfig(folder: string, name: string): Promise<string> {
	await mkdir(folder, { recursive: true });
	await writeFile(join(folder, 'likec4.config.json'), JSON.stringify({ name }));
	await writeFile(join(folder, 'model.c4'), 'model {}');
	return folder;
}

async function setup(root: string, options: LikeC4IntegrationOptions) {
	const updateConfig = vi.fn();
	const logger = { info: vi.fn(), warn: vi.fn(), fork: vi.fn() };
	logger.fork.mockImplementation(() => logger);

	await likec4Integration({ ...options, fences: false }).hooks['astro:config:setup']!({
		command: 'dev',
		config: { root: pathToFileURL(join(root, '/')), vite: {}, integrations: [] },
		updateConfig,
		logger,
	} as never);

	const vite = (updateConfig.mock.calls[0]?.[0] as { vite: { plugins: any[] } }).vite;

	return { logger, vite };
}

/** Load `virtual:astroc4/projects` through the plugin that serves it. */
async function projectsModuleSource(plugins: any[]): Promise<string> {
	for (const plugin of plugins) {
		const resolved = await plugin.resolveId?.(PROJECTS_MODULE_ID);
		if (resolved) return plugin.load(resolved);
	}

	throw new Error('no plugin serves virtual:astroc4/projects');
}

describe('likec4Integration with projects', () => {
	beforeEach(() => likec4VitePlugin.mockClear());

	it('passes the staging workspace to LikeC4VitePlugin when projects is set', async () => {
		const temp = await mkdtemp(join(tmpdir(), 'astroc4-site-'));
		const site = join(temp, 'site');
		await folderWithConfig(join(site, 'src', 'likec4'), 'local');
		const external = await folderWithConfig(join(temp, 'external'), 'external-model');

		const { vite } = await setup(site, { projects: { architecture: external } });

		expect(likec4VitePlugin).toHaveBeenCalledWith({ workspace: join(site, '.astro', 'astroc4', 'workspace') });
		const source = await projectsModuleSource(vite.plugins);
		expect(source).toContain('["architecture","local"]');
		expect(source).toContain('"architecture":"external-model"');
	});

	it('installs the icon plugin and copies gathered icons when the build is done', async () => {
		const temp = await mkdtemp(join(tmpdir(), 'astroc4-site-'));
		const site = join(temp, 'site');
		await mkdir(site);
		const external = await folderWithConfig(join(temp, 'external'), 'external-model');
		const integration = likec4Integration({ projects: { architecture: external }, fences: false });
		const updateConfig = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), fork: vi.fn() };

		await integration.hooks['astro:config:setup']!({
			command: 'build',
			config: { root: pathToFileURL(join(site, '/')), base: '/', vite: {}, integrations: [] },
			updateConfig,
			logger,
		} as never);

		const plugins = (updateConfig.mock.calls[0]?.[0] as { vite: { plugins: any[] } }).vite.plugins;
		expect(plugins.map((plugin) => plugin.name)).toContain('@purview-dev/astroc4/icons');
		expect(typeof integration.hooks['astro:build:done']).toBe('function');
	});

	it('keeps an explicit vitePlugin.workspace and says projects is ignored', async () => {
		const site = await mkdtemp(join(tmpdir(), 'astroc4-site-'));
		const external = await folderWithConfig(join(site, '..', `ext-${Date.now()}`), 'ext');

		const { logger } = await setup(site, { vitePlugin: { workspace: 'diagrams' }, projects: { ext: external } });

		expect(likec4VitePlugin).toHaveBeenCalledWith({ workspace: 'diagrams' });
		expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/projects.*ignored|ignored.*projects/));
	});

	it('leaves discovery to LikeC4 when projects is not set, and still names the discovered projects', async () => {
		const site = await mkdtemp(join(tmpdir(), 'astroc4-site-'));
		await folderWithConfig(join(site, 'src', 'likec4'), 'playground');

		const { vite } = await setup(site, {});

		expect(likec4VitePlugin).toHaveBeenCalledWith({});
		expect(await projectsModuleSource(vite.plugins)).toContain('["playground"]');
	});
});
