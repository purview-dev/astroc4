// The Astro wrappers translate on the server and pass islands plain strings,
// because `Astro.locals.t` does not exist in the browser.

// `files` publishes `src/translations.ts` next to `src/components`, so this
// resolves in an installed package.
import { translations } from '../translations.ts';

export type TranslationKey = keyof (typeof translations)['en'];
export type Translate = (key: TranslationKey) => string;

export type IslandLabels = {
	loading: string;
	errorTitle: string;
	errorBody: string;
	errorRetry: string;
	viewIdRequired: string;
	noProjects: string;
	/** Template: `{projectId}`, `{available}`. */
	unknownProject: string;
	/** Template: `{available}`. */
	projectRequired: string;
	unresolvedProject: string;
	/** Template: `{projectId}`. */
	loadFailed: string;
};

const english: Translate = (key) => translations.en[key];

/** `t` is absent on any page Starlight does not render, so English is the fallback. */
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
		projectRequired: t('likec4.error.projectRequired'),
		unresolvedProject: t('likec4.error.unresolvedProject'),
		loadFailed: t('likec4.error.loadFailed'),
	};
}

export const DEFAULT_LABELS: IslandLabels = getIslandLabels(english, 'likec4.view.loading');

/** Unknown placeholders are left in place so they show up. */
export function format(template: string, values: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
