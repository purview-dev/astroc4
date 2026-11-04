// expressive-code.ts
// path: src/expressive-code.ts
// LikeC4 syntax highlighting for Expressive Code (Starlight's code blocks).
// Shiki ships no LikeC4 grammar, so without this .c4 source renders as plain
// text.
//
// The Starlight plugin injects this language into the site's Expressive Code
// options for you (see src/index.ts) resolved from the live Langium grammar.
// The exports here cover the two cases the plugin cannot:
//
//   - a site that already has an `ec.config.mjs`, which can add the bundled
//     grammar with one line:
//
//       import { likec4Language } from '@purview-dev/astroc4/expressive-code';
//       export default defineEcConfig({ shiki: { langs: [likec4Language] } });
//
//   - anything else that needs the grammar programmatically, e.g. a Markdown
//     pipeline of its own: `await loadLikeC4Language({ ref: 'v1.59.4' })`.
//
// `likec4Language` is the bundled snapshot, so it works without network
// access; `loadLikeC4Language` fetches the ref you ask for.

import type { LanguageRegistration } from 'shiki';

import grammar from './grammar/likec4.tmLanguage.json' with { type: 'json' };
import { resolveLikeC4Grammar, type GrammarSourceOptions } from './grammar/source.js';
import { LANGUAGE_ALIASES, LANGUAGE_NAME, type TmGrammar } from './grammar/textmate.js';

/**
 * The snapshot is a `TmGrammar` by construction — `buildTmLanguage` produced it
 * and the snapshot test asserts it — but Shiki wants `IRawRepository`, which
 * the generated `repository` (JSON, not `RegExp`) cannot satisfy structurally.
 * One cast here beats one at every call site.
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

/**
 * Resolve the grammar from likec4/likec4 at the ref you ask for and return it
 * as a Shiki language registration.
 */
export async function loadLikeC4Language(
	options?: GrammarSourceOptions,
): Promise<LanguageRegistration & { aliases: string[] }> {
	const { grammar: resolved } = await resolveLikeC4Grammar(options);

	return registration(resolved);
}

export default likec4Language;
