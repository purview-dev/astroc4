// Compiles `<LikeC4View file="…">` sources here, in Vite's plugin context,
// because the SSR module runner cannot safely load LikeC4's Node API.

import { readFile } from 'node:fs/promises';

import type { Plugin as VitePlugin } from 'vite';

import { layoutSource } from './fences.ts';

/** The import query `LikeC4View.astro` adds to a `.c4` file it renders. */
export const FILE_LAYOUT_QUERY = '?astroc4-layout';

export function fileLayoutPlugin(): VitePlugin {
	return {
		name: '@purview-dev/astroc4/file-layout',
		async load(id) {
			if (!id.endsWith(FILE_LAYOUT_QUERY)) return null;

			const file = id.slice(0, -FILE_LAYOUT_QUERY.length);
			this.addWatchFile(file);

			let layout;

			try {
				layout = await layoutSource(await readFile(file, 'utf8'));
			} catch (error) {
				throw new Error(`[astroc4] ${file} is not valid LikeC4 — ${(error as Error).message}`);
			}

			return `export default ${JSON.stringify(layout)};`;
		},
	};
}
