import { mkdir, mkdtemp, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ResolvedProject } from '../projects';
import { prepareWorkspace, projectsModule, PROJECTS_MODULE_ID } from '../workspace';

async function folderWithConfig(root: string, name: string): Promise<string> {
	const folder = join(root, name);
	await mkdir(folder, { recursive: true });
	await writeFile(join(folder, 'likec4.config.json'), JSON.stringify({ name }));
	return folder;
}

function project(name: string, folder: string, likec4Id = name): ResolvedProject {
	return { name, folder, likec4Id, source: 'configured', imageAliases: {} };
}

describe('prepareWorkspace', () => {
	it('creates one entry per project named by its resolved name', async () => {
		const root = await mkdtemp(join(tmpdir(), 'astroc4-workspace-'));
		const a = await folderWithConfig(root, 'a');
		const b = await folderWithConfig(root, 'b');

		const staging = await prepareWorkspace([project('first', a), project('second', b)], join(root, 'cache'));

		expect(staging).toBe(join(root, 'cache', 'workspace'));
		expect((await readdir(staging)).sort()).toEqual(['first', 'second']);
		expect(await realpath(join(staging, 'first'))).toBe(await realpath(a));
	});

	it('removes an entry for a project no longer configured', async () => {
		const root = await mkdtemp(join(tmpdir(), 'astroc4-workspace-'));
		const a = await folderWithConfig(root, 'a');
		const b = await folderWithConfig(root, 'b');
		const cache = join(root, 'cache');

		await prepareWorkspace([project('first', a), project('second', b)], cache);
		const staging = await prepareWorkspace([project('first', a)], cache);

		expect(await readdir(staging)).toEqual(['first']);
		// Removing the link never touches the project it pointed at.
		expect(await readdir(b)).toEqual(['likec4.config.json']);
	});

	it('is idempotent', async () => {
		const root = await mkdtemp(join(tmpdir(), 'astroc4-workspace-'));
		const a = await folderWithConfig(root, 'a');
		const cache = join(root, 'cache');

		await prepareWorkspace([project('first', a)], cache);
		const staging = await prepareWorkspace([project('first', a)], cache);

		expect(await readdir(staging)).toEqual(['first']);
	});

	it('repoints an entry whose project moved', async () => {
		const root = await mkdtemp(join(tmpdir(), 'astroc4-workspace-'));
		const a = await folderWithConfig(root, 'a');
		const b = await folderWithConfig(root, 'b');
		const cache = join(root, 'cache');

		await prepareWorkspace([project('first', a)], cache);
		const staging = await prepareWorkspace([project('first', b)], cache);

		expect(await realpath(join(staging, 'first'))).toBe(await realpath(b));
	});
});

describe('projectsModule', () => {
	it('exports the project names and their LikeC4 ids', () => {
		const source = projectsModule([project('architecture', '/x', 'minder-architecture'), project('other', '/y')]);

		expect(source).toContain('export const projectNames = ["architecture","other"];');
		expect(source).toContain('export const likec4IdFor = {"architecture":"minder-architecture","other":"other"};');
	});

	it('has a stable virtual id', () => {
		expect(PROJECTS_MODULE_ID).toBe('virtual:astroc4/projects');
	});
});
