// types.d.ts
// path: src/types.d.ts
// Ambient types for the package source: the `likec4:*` virtual modules created
// by LikeC4VitePlugin, and the plugin's keys in Starlight's `t()`.

/// <reference types="likec4/vite-plugin-modules" />

/** Served by the integration (src/workspace.ts): the names `project` accepts. */
declare module 'virtual:astroc4/projects' {
	export const projectNames: string[];
	export const likec4IdFor: Record<string, string>;
}

declare namespace StarlightApp {
	type LikeC4UIStrings = (typeof import('./translations.js'))['translations']['en'];
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
	interface I18n extends LikeC4UIStrings {}
}
