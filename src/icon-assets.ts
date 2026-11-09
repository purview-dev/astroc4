// icon-assets.ts
// path: src/icon-assets.ts
// Where a LikeC4 icon that lives on disk is served from.
//
// LikeC4 resolves `icon @/azure/x.svg` (through the project's `imageAliases`)
// and `icon ./icons/x.svg` to absolute `file://` URLs in the compiled model.
// Shipped as they are, those 404 for every visitor and leak the build
// machine's folders. Each is mapped here to a URL under `/_astroc4/` that the
// dev server serves and the build copies, so an author keeps writing
// `icon @/…` and the site just works.
//
//   @  -> <project>/images      icon @/azure/entra/x.svg  -> /_astroc4/<project>/azure/entra/x.svg
//   @brand -> ../brand          icon @brand/logo.svg      -> /_astroc4/<project>/brand/logo.svg
//   (no alias)                  icon ../shared/a.svg      -> /_astroc4/<project>/__up/shared/a.svg
//
// Files already under the site's `public/` are Astro's to serve, and
// `classifyIcon` keeps handling them.

import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Astroc4ConfigError, type ResolvedProject } from './projects.js';

/** The URL prefix every gathered icon is served under (after Astro's `base`). */
export const ICON_ROUTE = '/_astroc4/';

/** The segment a `..` in a relative icon path becomes, so URLs never climb. */
const UP = '__up';

export interface IconAsset {
	/** The file on disk, with links resolved. */
	file: string;
	/** The served path, including Astro's `base`. */
	url: string;
	projectName: string;
}

/**
 * The served asset for one compiled icon URL, or `null` for a file the site's
 * `public/` folder already serves.
 */
export function iconAssetFor(
	project: ResolvedProject,
	fileUrl: string,
	base: string,
	siteRoot: string,
): IconAsset | null {
	const file = realFile(fileUrl);

	if (isInside(file, tryRealpath(join(siteRoot, 'public')))) {
		return null;
	}

	const segments = aliasSegments(project, file) ?? relativeSegments(tryRealpath(project.folder), file);
	const path = [project.name, ...segments].map(encodeURIComponent).join('/');

	return { file, url: `${base.replace(/\/+$/, '')}${ICON_ROUTE}${path}`, projectName: project.name };
}

/**
 * Every compiled icon URL that needs serving, keyed by that URL.
 *
 * @throws Astroc4ConfigError for a missing icon (naming the `.c4` file) or for
 * two different files that would be served at the same URL.
 */
export function buildIconManifest(
	entries: Array<{ project: ResolvedProject; fileUrl: string; source: string }>,
	base: string,
	siteRoot: string,
): Map<string, IconAsset> {
	const manifest = new Map<string, IconAsset>();
	const byUrl = new Map<string, { asset: IconAsset; source: string }>();

	for (const { project, fileUrl, source } of entries) {
		let asset: IconAsset | null;

		try {
			asset = iconAssetFor(project, fileUrl, base, siteRoot);
		} catch (error) {
			throw new Astroc4ConfigError(`${source}: ${(error as Error).message.replace(/^\[astroc4\] /, '')}`);
		}

		if (asset === null) continue;

		const existing = byUrl.get(asset.url);

		if (existing && !samePath(existing.asset.file, asset.file)) {
			throw new Astroc4ConfigError(
				`two icons would be served at ${asset.url}: ${existing.asset.file} (${existing.source}) and ${asset.file} (${source}). Rename one, or give its alias another name.`,
			);
		}

		byUrl.set(asset.url, { asset, source });
		manifest.set(fileUrl, asset);
	}

	return manifest;
}

/** The longest alias folder containing `file`: `[alias name?, …path under it]`. */
function aliasSegments(project: ResolvedProject, file: string): string[] | null {
	let best: { folder: string; alias: string } | null = null;

	for (const [alias, folder] of Object.entries(project.imageAliases)) {
		const real = tryRealpath(folder);

		if (isInside(file, real) && (best === null || real.length > best.folder.length)) {
			best = { folder: real, alias };
		}
	}

	if (best === null) return null;

	const name = best.alias.replace(/^@/, '');

	return [...(name ? [name] : []), ...split(relative(best.folder, file))];
}

function relativeSegments(folder: string, file: string): string[] {
	return split(relative(folder, file)).map((segment) => (segment === '..' ? UP : segment));
}

function realFile(fileUrl: string): string {
	let path: string;

	try {
		// `file:///p%3A/…` is how LikeC4 writes a Windows drive; decoding first
		// lets `fileURLToPath` read it like `file:///P:/…`.
		path = fileURLToPath(decodeDrive(fileUrl));
	} catch {
		throw new Astroc4ConfigError(`icon ${fileUrl} is not a file URL.`);
	}

	try {
		return realpathSync(path);
	} catch {
		throw new Astroc4ConfigError(`icon ${path} does not exist.`);
	}
}

function decodeDrive(fileUrl: string): string {
	return fileUrl.replace(/^file:\/\/\/([A-Za-z])%3A/i, 'file:///$1:');
}

function tryRealpath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function isInside(file: string, folder: string): boolean {
	const path = relative(folder, file);

	return path.length > 0 && !path.startsWith('..') && !isAbsolute(path);
}

function samePath(a: string, b: string): boolean {
	return sep === '\\' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function split(path: string): string[] {
	return path.split(/[\\/]+/).filter((segment) => segment.length > 0);
}
