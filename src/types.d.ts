/// <reference types="likec4/vite-plugin-modules" />

/** Served by src/workspace.ts: the names `project` accepts. */
declare module 'virtual:astroc4/projects' {
	export const projectNames: string[];
	export const likec4IdFor: Record<string, string>;
}

declare namespace StarlightApp {
	type LikeC4UIStrings = (typeof import('./translations.ts'))['translations']['en'];
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
	interface I18n extends LikeC4UIStrings {}
}
