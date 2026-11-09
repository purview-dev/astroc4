import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Astroc4ConfigError, discoverProjects, resolveProjects } from '../projects';

async function project(folder: string, name: string, extra: Record<string, unknown> = {}): Promise<string> {
	await mkdir(folder, { recursive: true });
	await writeFile(join(folder, 'likec4.config.json'), JSON.stringify({ name, ...extra }));
	await writeFile(join(folder, 'model.c4'), 'model {}');
	return folder;
}

async function tempRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'astroc4-projects-'));
}

describe('resolveProjects', () => {
	it('resolves a configured folder relative to root and an absolute one', async () => {
		const root = await tempRoot();
		await project(join(root, 'site', 'diagrams'), 'site-diagrams');
		const outside = await project(join(root, 'elsewhere'), 'elsewhere-config-name');

		const projects = await resolveProjects({
			root: join(root, 'site'),
			configured: { local: './diagrams', remote: outside },
			discovered: [],
		});

		expect(projects).toMatchObject([
			{ name: 'local', folder: resolve(root, 'site', 'diagrams'), likec4Id: 'site-diagrams', source: 'configured' },
			{ name: 'remote', folder: outside, likec4Id: 'elsewhere-config-name', source: 'configured' },
		]);
	});

	it('fails for a configured folder that does not exist', async () => {
		const root = await tempRoot();

		await expect(
			resolveProjects({ root, configured: { missing: './nowhere' }, discovered: [] }),
		).rejects.toThrow(Astroc4ConfigError);
		await expect(
			resolveProjects({ root, configured: { missing: './nowhere' }, discovered: [] }),
		).rejects.toThrow(/missing.*nowhere|nowhere.*missing/s);
	});

	it('fails for a configured folder without likec4.config.json', async () => {
		const root = await tempRoot();
		await mkdir(join(root, 'empty'));

		await expect(
			resolveProjects({ root, configured: { empty: './empty' }, discovered: [] }),
		).rejects.toThrow(/likec4\.config\.json[\s\S]*empty/);
	});

	it('compiles a configured project that is also discovered once, under its configured name', async () => {
		const root = await tempRoot();
		await project(join(root, 'diagrams'), 'site-diagrams');
		const discovered = await discoverProjects(root);

		const projects = await resolveProjects({ root, configured: { arch: './diagrams' }, discovered });

		expect(projects).toHaveLength(1);
		expect(projects[0]).toMatchObject({ name: 'arch', source: 'configured' });
	});

	it('fails when two projects share a name', async () => {
		const root = await tempRoot();
		await project(join(root, 'a'), 'shared');
		const other = await project(join(root, 'outside', 'b'), 'other');
		const discovered = await discoverProjects(join(root, 'a'));

		await expect(
			resolveProjects({ root: join(root, 'a'), configured: { shared: other }, discovered }),
		).rejects.toThrow(/shared[\s\S]*a[\s\S]*b|shared[\s\S]*b[\s\S]*a/);
	});

	it('resolves imageAliases to absolute folders against the project folder', async () => {
		const root = await tempRoot();
		const folder = await project(join(root, 'diagrams'), 'site-diagrams', {
			imageAliases: { '@': './images', '@brand': '../brand' },
		});

		const [resolved] = await resolveProjects({ root, configured: { arch: folder }, discovered: [] });

		expect(resolved!.imageAliases).toEqual({
			'@': resolve(folder, 'images'),
			'@brand': resolve(root, 'brand'),
		});
	});
});

describe('discoverProjects', () => {
	it('finds every likec4.config.json under root and names it by its config name', async () => {
		const root = await tempRoot();
		await project(join(root, 'src', 'likec4'), 'playground');

		const projects = await discoverProjects(root);

		expect(projects).toMatchObject([
			{ name: 'playground', likec4Id: 'playground', source: 'discovered', folder: resolve(root, 'src', 'likec4') },
		]);
	});

	it('skips node_modules and dot folders', async () => {
		const root = await tempRoot();
		await project(join(root, 'node_modules', 'pkg'), 'from-node-modules');
		await project(join(root, '.astro', 'astroc4', 'workspace', 'x'), 'from-cache');

		expect(await discoverProjects(root)).toEqual([]);
	});
});
