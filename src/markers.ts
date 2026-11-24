// `purview:likec4` HTML-comment markers: a GitHub-renderable Mermaid fence
// paired with the LikeC4 model it stands in for. The parsing and path
// resolution here are ported from purview.dev's `parseDiagramOptions` and
// `resolveDiagramPath` (`src/lib/docs/diagrams.ts`); the Sätteri plugin that
// replaces the markers lives in `fences.ts`.

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER_OPEN = /^ {0,3}<!--\s*purview:likec4\b(.*?)-->\s*$/;
export const MARKER_CLOSE = /^ {0,3}<!--\s*\/purview:likec4\s*-->\s*$/;

/** Parse `key="value" key='value' key=bare` pairs from a marker's attributes. */
export function parseMarkerOptions(attributes: string): Record<string, string> {
	const options: Record<string, string> = {};
	const pattern = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(attributes))) {
		options[match[1] ?? ''] = match[2] ?? match[3] ?? match[4] ?? '';
	}
	return options;
}

/**
 * A marker's `file="…"`, resolved against the page it is on (or `/`-rooted at
 * `root`, the repository root, the way GitHub resolves it). Mirrors the
 * containment test `readFenceFile` uses for a fence's `file=` (`fences.ts`),
 * except the root here is the repository, not the Astro site. Throws when
 * the result would leave `root`.
 */
export function resolveMarkerFile(file: string, pageURL: URL, root: string): string {
	const base = resolve(root);
	const path = file.startsWith('/')
		? resolve(base, file.slice(1))
		: resolve(dirname(fileURLToPath(pageURL)), file);
	const fromRoot = relative(base, path);

	if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
		throw new Error(`"${file}" is outside the repository (${path}).`);
	}

	return path;
}

/** The nearest ancestor of `start` (inclusive) holding `.git`, else `start`. */
export function findRepositoryRoot(start: string): string {
	let dir = resolve(start);

	for (;;) {
		if (existsSync(join(dir, '.git'))) {
			return dir;
		}

		const parent = dirname(dir);
		if (parent === dir) {
			return start;
		}

		dir = parent;
	}
}
