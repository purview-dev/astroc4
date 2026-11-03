// expressive-code.mjs
// path: src/expressive-code.mjs
// LikeC4 syntax highlighting for Expressive Code (Starlight's code blocks).
// Shiki ships no LikeC4 grammar, so without this .c4 source renders as plain
// text.
//
// The Starlight plugin injects this language into the site's Expressive Code
// options for you (see src/index.mjs) resolved from the live Langium grammar.
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

import grammar from './grammar/likec4.tmLanguage.json' with { type: 'json' };
import { resolveLikeC4Grammar } from './grammar/source.mjs';
import { LANGUAGE_ALIASES, LANGUAGE_NAME } from './grammar/textmate.mjs';

/** @type {import('shiki').LanguageRegistration} */
export const likec4Language = {
	...grammar,
	name: LANGUAGE_NAME,
	aliases: [...LANGUAGE_ALIASES],
};

/**
 * Resolve the grammar from likec4/likec4 at the ref you ask for and return it
 * as a Shiki language registration.
 * @param {import('./grammar/source.mjs').GrammarSourceOptions} [options]
 * @returns {Promise<import('shiki').LanguageRegistration>}
 */
export async function loadLikeC4Language(options) {
	const { grammar: resolved } = await resolveLikeC4Grammar(options);

	return { ...resolved, name: LANGUAGE_NAME, aliases: [...LANGUAGE_ALIASES] };
}

export default likec4Language;
