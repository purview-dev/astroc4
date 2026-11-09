// icon-plugin.ts
// path: src/icon-plugin.ts
// Makes image aliases just work: every icon LikeC4 compiled to a `file://` URL
// is rewritten to its `/_astroc4/…` URL before the model reaches the browser,
// served from its original file by the dev server, and copied into the build
// output. The author writes `icon @/azure/x.svg` and changes nothing else.
//
// LikeC4 serializes its generated modules with every `/` escaped as `/`
// (so they can be inlined into HTML), which is why URLs are matched in both
// forms and written back in the form they were found in.

import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Plugin as VitePlugin } from 'vite';

import { buildIconManifest, ICON_ROUTE, type IconAsset } from './icon-assets.js';
import type { ResolvedProject } from './projects.js';

/** The ids LikeC4's Vite plugin resolves its per-project modules to. */
const LIKEC4_MODULE = /likec4:plugin\/(?<projectId>[^/]+)\/[^/]+$/;

/** A `file:///…` URL, plain or with LikeC4's escaped slashes. */
const FILE_URL = /file:(?:\\u002F|\/){3}[^"'`\s]+/g;

const CONTENT_TYPES: Record<string, string> = {
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
};

export interface IconPluginState {
	projects: ResolvedProject[];
	/** Astro's `base`. */
	base: string;
	/** The site root; files under its `public/` are left to Astro. */
	siteRoot: string;
}

export type Astroc4IconPlugin = VitePlugin & {
	/** Every icon gathered so far, keyed by its compiled `file://` URL. */
	manifest(): Map<string, IconAsset>;
	/** Copy every gathered icon into a build output folder at its URL. */
	emit(outDir: string): Promise<void>;
};

export function astroc4IconPlugin(state: IconPluginState): Astroc4IconPlugin {
	const manifest = new Map<string, IconAsset>();
	const byUrl = new Map<string, IconAsset>();
	const base = state.base.replace(/\/+$/, '');

	function gather(project: ResolvedProject, fileUrl: string): IconAsset | undefined {
		const known = manifest.get(fileUrl);
		if (known) return known;

		const entries = [
			// Re-validating against what is already served is how a second file at
			// the same URL is caught, whichever module compiled first.
			...[...byUrl.values()].map((asset) => ({
				project: state.projects.find((p) => p.name === asset.projectName)!,
				fileUrl: pathToFileURL(asset.file).href,
				source: `LikeC4 project "${asset.projectName}"`,
			})),
			{ project, fileUrl, source: `LikeC4 project "${project.name}"` },
		];

		const asset = buildIconManifest(entries, state.base, state.siteRoot).get(fileUrl);
		if (!asset) return undefined;

		manifest.set(fileUrl, asset);
		byUrl.set(asset.url, asset);

		return asset;
	}

	return {
		name: '@purview-dev/astroc4/icons',
		enforce: 'post',
		transform(code, id) {
			const match = LIKEC4_MODULE.exec(id);
			if (!match) return null;

			const project = state.projects.find((p) => p.likec4Id === match.groups!.projectId);
			if (!project || !code.includes('file:')) return null;

			const rewritten = code.replace(FILE_URL, (found) => {
				const escapedForm = found.includes('\\u002F');
				const asset = gather(project, found.replaceAll('\\u002F', '/'));

				if (!asset) return found;

				return escapedForm ? asset.url.replaceAll('/', '\\u002F') : asset.url;
			});

			return rewritten === code ? null : { code: rewritten, map: null };
		},
		configureServer(server) {
			const prefix = `${base}${ICON_ROUTE}`;

			server.middlewares.use(async (req, res, next) => {
				const url = req.url?.split('?')[0];

				if (!url?.startsWith(prefix)) return next();

				const asset = byUrl.get(url);

				// Only what the model asked for is ever served: no path from the
				// request reaches the file system.
				if (!asset) {
					res.statusCode = 404;
					res.end();
					return;
				}

				res.setHeader('Content-Type', CONTENT_TYPES[extname(asset.file).toLowerCase()] ?? 'application/octet-stream');
				res.end(await readFile(asset.file));
			});
		},
		manifest: () => manifest,
		async emit(outDir) {
			for (const asset of byUrl.values()) {
				const target = join(outDir, ...decodeURIComponent(asset.url.slice(base.length)).split('/'));

				await mkdir(dirname(target), { recursive: true });
				await copyFile(asset.file, target);
			}
		},
	};
}
