import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import type { ConfigFilenames } from 'likec4/config';

/**
 * LikeC4's config file names, in the order it prefers them. `satisfies` fails
 * the type-check when LikeC4 adds or renames one.
 */
const CONFIG_FILES = [
	'.likec4rc',
	'.likec4.config.json',
	'likec4.config.json',
	'likec4.config.js',
	'likec4.config.cjs',
	'likec4.config.mjs',
	'likec4.config.ts',
	'likec4.config.cts',
	'likec4.config.mts',
] as const satisfies typeof ConfigFilenames;

const JSON_CONFIG_FILES: readonly string[] = CONFIG_FILES.slice(0, 3);

export interface ResolvedProject {
	/** The name components pass as `project`. */
	name: string;
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
		const file = configFileIn(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

		if (file) {
			const config = await readConfig(folder, file);
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

		const file = configFileIn(await readdir(folder));

		if (!file) {
			throw new Astroc4ConfigError(
				`project "${name}": no LikeC4 config file (likec4.config.json, .likec4rc, likec4.config.ts, …) in ${folder}.`,
			);
		}

		configured.push(toProject(name, folder, await readConfig(folder, file), 'configured'));
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

	// LikeC4 registers a project by its config's `name`, so two that share one
	// collide inside the compiler however they are named here.
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

function configFileIn(names: string[]): string | undefined {
	return CONFIG_FILES.find((file) => names.includes(file));
}

/**
 * A project's config, read the way LikeC4 reads it: JSON files as JSON5, the
 * rest bundled and evaluated, and `name` defaulting to the folder's name.
 */
async function readConfig(folder: string, file: string): Promise<LikeC4Config> {
	const path = join(folder, file);
	let config: unknown;

	try {
		config = JSON_CONFIG_FILES.includes(file) ? await readJsonConfig(path) : await evaluateConfig(path, folder);
	} catch (error) {
		throw new Astroc4ConfigError(`${path} could not be read: ${(error as Error).message}`);
	}

	if (typeof config !== 'object' || config === null || Array.isArray(config)) {
		throw new Astroc4ConfigError(`${path} must define a config object.`);
	}

	const { name = basename(folder), imageAliases } = config as { name?: unknown; imageAliases?: unknown };

	if (typeof name !== 'string' || name.trim().length === 0) {
		throw new Astroc4ConfigError(`${path} has an empty "name".`);
	}

	return { name, imageAliases: isRecord(imageAliases) ? imageAliases : undefined };
}

async function readJsonConfig(path: string): Promise<unknown> {
	const { default: JSON5 } = await import('json5');
	const text = (await readFile(path, 'utf8')).trim();

	return JSON5.parse(text || '{}');
}

/**
 * `likec4/config`'s helpers are identity functions, so they are replaced with
 * one, as LikeC4 does: a project outside the site need not be able to resolve
 * the package.
 */
async function evaluateConfig(path: string, folder: string): Promise<unknown> {
	const { bundleRequire } = await import('bundle-require');

	const { mod } = await bundleRequire({
		filepath: path,
		cwd: folder,
		esbuildOptions: {
			resolveExtensions: ['.ts', '.mts', '.cts', '.mjs', '.js', '.cjs'],
			plugins: [
				{
					name: 'astroc4-likec4-config',
					setup(build) {
						build.onResolve({ filter: /^@?likec4\/config$/ }, (args) => ({
							path: args.path,
							namespace: 'astroc4-likec4-config',
						}));
						build.onLoad({ filter: /.*/, namespace: 'astroc4-likec4-config' }, () => ({
							contents: [
								'const identity = (value) => value;',
								'export { identity as defineConfig, identity as defineGenerators, identity as defineStyle, identity as defineTheme, identity as defineThemeColor };',
							].join('\n'),
							loader: 'js',
						}));
					},
				},
			],
		},
	});

	return (mod as { default?: unknown }).default ?? mod;
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

function isRecord(value: unknown): value is Record<string, string> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === 'string')
	);
}

async function isDirectory(path: string): Promise<boolean> {
	return (await stat(path).catch(() => null))?.isDirectory() ?? false;
}
