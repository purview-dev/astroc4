// labels.ts
// path: src/components/labels.ts
// Resolves the plugin's UI strings for a page. The Astro wrappers translate on
// the server and pass the islands plain strings, because `Astro.locals.t` does
// not exist in the browser.

// The package name, not a relative path: this file ships as source inside
// `src/components/`, and the strings it needs live in `dist/translations.js`.
// A relative `../translations.js` would point outside the published tree.
import { translations } from '@purview-dev/astroc4/translations';

export type TranslationKey = keyof (typeof translations)['en'];
export type Translate = (key: TranslationKey) => string;

/** Every string an island can show after hydration. */
export type IslandLabels = {
	loading: string;
	errorTitle: string;
	errorBody: string;
	errorRetry: string;
	viewIdRequired: string;
	noProjects: string;
	/** Template: `{projectId}`, `{available}`. */
	unknownProject: string;
	unresolvedProject: string;
	/** Template: `{projectId}`. */
	loadFailed: string;
};

const english: Translate = (key) => translations.en[key];

/**
 * Wrap `Astro.locals.t`, falling back to English when it is absent — which it
 * is on any page Starlight does not render, such as a plain `src/pages/` route.
 */
export function getTranslator(t: unknown): Translate {
	if (typeof t !== 'function') return english;

	return (key) => {
		const value: unknown = t(key);

		return typeof value === 'string' && value.length > 0 ? value : english(key);
	};
}

export function getIslandLabels(t: Translate, loadingKey: TranslationKey): IslandLabels {
	return {
		loading: t(loadingKey),
		errorTitle: t('likec4.error.title'),
		errorBody: t('likec4.error.body'),
		errorRetry: t('likec4.error.retry'),
		viewIdRequired: t('likec4.error.viewIdRequired'),
		noProjects: t('likec4.error.noProjects'),
		unknownProject: t('likec4.error.unknownProject'),
		unresolvedProject: t('likec4.error.unresolvedProject'),
		loadFailed: t('likec4.error.loadFailed'),
	};
}

export const DEFAULT_LABELS: IslandLabels = getIslandLabels(english, 'likec4.view.loading');

/** Fill `{name}` placeholders. Unknown names are left in place so they show up. */
export function format(template: string, values: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
