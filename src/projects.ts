// projects.ts
// path: src/projects.ts
// Which LikeC4 projects a site renders, and what each is called.
//
// Two sources, compiled together:
//   - discovered: every `likec4.config.json` under the site root, named by the
//     `name` in its own config (today's behaviour);
//   - configured: `projects: { <name>: <folder> }` in the plugin options, where
//     the folder may live anywhere — another repository, a sibling folder — and
//     the key is the name components use.
//
// Every failure is an `Astroc4ConfigError` naming the folder, so a typo in
// astro.config fails the build with the path rather than a blank diagram.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const CONFIG_FILE = 'likec4.config.json';

export interface ResolvedProject {
	/** The name components pass as `project`. */
	name: string;
	/** Absolute folder holding the project's `likec4.config.json`. */
	folder: string;
	/** The `name` in the project's own config — LikeC4's project id. */
	likec4Id: string;
	source: 'configured' | 'discovered';
	/** `imageAliases` from the config, each resolved to an absolute folder. */
	imageAliases: Record<string, string>;
}

export class Astroc4ConfigError extends Error {
	constructor(message: string) {
		super(`[astroc4] ${message}`);
		this.name = 'Astroc4ConfigError';
	}
}

/** Every LikeC4 project under `root`, skipping `node_modules` and dot folders. */
export async function discoverProjects(root: string): Promise<ResolvedProject[]> {
	const found: ResolvedProject[] = [];

	async function walk(folder: string): Promise<void> {
		const entries = await readdir(folder, { withFileTypes: true });

		if (entries.some((entry) => entry.isFile() && entry.name === CONFIG_FILE)) {
			const config = await readConfig(folder);
			found.push(toProject(config.name, folder, config, 'discovered'));
		}

		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			await walk(join(folder, entry.name));
		}
	}

	await walk(resolve(root));
	return found;
}

/**
 * Configured projects first, in declaration order, then the discovered ones
 * no configured entry already covers.
 */
export async function resolveProjects(options: {
	root: string;
	configured?: Record<string, string>;
	discovered: ResolvedProject[];
}): Promise<ResolvedProject[]> {
	const configured: ResolvedProject[] = [];

	for (const [name, path] of Object.entries(options.configured ?? {})) {
		const folder = resolve(options.root, path);

		if (!(await isDirectory(folder))) {
			throw new Astroc4ConfigError(`project "${name}": folder ${folder} does not exist.`);
		}

		if (!(await isFile(join(folder, CONFIG_FILE)))) {
			throw new Astroc4ConfigError(`project "${name}": no ${CONFIG_FILE} in ${folder}.`);
		}

		configured.push(toProject(name, folder, await readConfig(folder), 'configured'));
	}

	const configuredFolders = new Set(configured.map((project) => project.folder));
	const projects = [
		...configured,
		...options.discovered.filter((project) => !configuredFolders.has(project.folder)),
	];

	const byName = new Map<string, ResolvedProject>();

	for (const project of projects) {
		const existing = byName.get(project.name);

		if (existing) {
			throw new Astroc4ConfigError(
				`two LikeC4 projects are named "${project.name}": ${existing.folder} and ${project.folder}.`,
			);
		}

		byName.set(project.name, project);
	}

	// LikeC4 registers a project by the `name` in its own config, so two
	// projects from different places that share it would collide inside the
	// compiler however differently they are named here.
	const byId = new Map<string, ResolvedProject>();

	for (const project of projects) {
		const existing = byId.get(project.likec4Id);

		if (existing) {
			throw new Astroc4ConfigError(
				`two LikeC4 projects declare "name": "${project.likec4Id}" in their configs: ${existing.folder} and ${project.folder}. Rename one.`,
			);
		}

		byId.set(project.likec4Id, project);
	}

	return projects;
}

interface LikeC4Config {
	name: string;
	imageAliases?: Record<string, string>;
}

async function readConfig(folder: string): Promise<LikeC4Config> {
	const path = join(folder, CONFIG_FILE);
	let config: unknown;

	try {
		config = JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		throw new Astroc4ConfigError(`${path} is not valid JSON: ${(error as Error).message}`);
	}

	const name = (config as { name?: unknown }).name;

	if (typeof name !== 'string' || name.trim().length === 0) {
		throw new Astroc4ConfigError(`${path} has no "name".`);
	}

	return config as LikeC4Config;
}

function toProject(
	name: string,
	folder: string,
	config: LikeC4Config,
	source: ResolvedProject['source'],
): ResolvedProject {
	const imageAliases = Object.fromEntries(
		Object.entries(config.imageAliases ?? {}).map(([alias, path]) => [alias, resolve(folder, path)]),
	);

	return { name, folder: resolve(folder), likec4Id: config.name, source, imageAliases };
}

async function isDirectory(path: string): Promise<boolean> {
	return (await stat(path).catch(() => null))?.isDirectory() ?? false;
}

async function isFile(path: string): Promise<boolean> {
	return (await stat(path).catch(() => null))?.isFile() ?? false;
}
