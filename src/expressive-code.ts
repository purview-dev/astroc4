// For sites the plugin cannot inject into (an existing `ec.config.mjs`, a
// Markdown pipeline of their own). `likec4Language` is the bundled snapshot and
// needs no network; `loadLikeC4Language` fetches the ref asked for.

import type { LanguageRegistration } from 'shiki';

import grammar from './grammar/likec4.tmLanguage.json' with { type: 'json' };
import { resolveLikeC4Grammar, type GrammarSourceOptions } from './grammar/source.ts';
import { LANGUAGE_ALIASES, LANGUAGE_NAME, type TmGrammar } from './grammar/textmate.ts';

/**
 * Shiki wants `IRawRepository`, which the JSON `repository` cannot satisfy
 * structurally, so the cast lives here rather than at every call site.
 */
function registration(grammar: TmGrammar): LanguageRegistration & { aliases: string[] } {
	return {
		...grammar,
		name: LANGUAGE_NAME,
		aliases: [...LANGUAGE_ALIASES],
	} as LanguageRegistration & { aliases: string[] };
}

/** Shiki registration for LikeC4, under `likec4` with a `c4` alias. */
export const likec4Language: LanguageRegistration & { aliases: string[] } = registration(
	grammar as TmGrammar,
);

export async function loadLikeC4Language(
	options?: GrammarSourceOptions,
): Promise<LanguageRegistration & { aliases: string[] }> {
	const { grammar: resolved } = await resolveLikeC4Grammar(options);

	return registration(resolved);
}

export default likec4Language;
