// `LikeC4VitePlugin` takes a single `workspace`, so every project is linked
// (not copied, so LikeC4 sees edits) under one staging folder. It lives in
// `.astro/`, never `node_modules/`: LikeC4 excludes `**/node_modules/**`.

import { lstat, mkdir, readdir, readlink, realpath, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ResolvedProject } from './projects.ts';

export const PROJECTS_MODULE_ID = 'virtual:astroc4/projects';

/** @returns The staging folder to hand `LikeC4VitePlugin` as its `workspace`. */
export async function prepareWorkspace(projects: ResolvedProject[], cacheDir: string): Promise<string> {
	const staging = join(cacheDir, 'workspace');
	await mkdir(staging, { recursive: true });

	const wanted = new Map(projects.map((project) => [project.name, resolve(project.folder)]));

	for (const entry of await readdir(staging)) {
		const target = wanted.get(entry);

		if (target === undefined || !(await pointsAt(join(staging, entry), target))) {
			// `rm` on a link removes the link, never what it points at.
			await rm(join(staging, entry), { recursive: false, force: true });
		}
	}

	for (const [name, folder] of wanted) {
		const link = join(staging, name);

		if (await exists(link)) continue;

		// A junction needs no elevated rights on Windows; elsewhere the type
		// argument is ignored and a plain directory symlink is made.
		await symlink(folder, link, 'junction');
	}

	return staging;
}

export function projectsModule(projects: ResolvedProject[]): string {
	const names = projects.map((project) => project.name);
	const ids = Object.fromEntries(projects.map((project) => [project.name, project.likec4Id]));

	return [
		`export const projectNames = ${JSON.stringify(names)};`,
		`export const likec4IdFor = ${JSON.stringify(ids)};`,
	].join('\n');
}

async function pointsAt(link: string, target: string): Promise<boolean> {
	try {
		const stats = await lstat(link);

		if (!stats.isSymbolicLink()) return false;

		await readlink(link);
		return (await realpath(link)) === (await realpath(target));
	} catch {
		return false;
	}
}

async function exists(path: string): Promise<boolean> {
	return (await lstat(path).catch(() => null)) !== null;
}
