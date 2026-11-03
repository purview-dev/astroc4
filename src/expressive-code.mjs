// expressive-code.mjs
// path: src/expressive-code.mjs
// LikeC4 syntax highlighting for Expressive Code (Starlight's code blocks).
// Shiki ships no LikeC4 grammar, so without this .c4 source renders as plain
// text. Add it to the site's ec.config.mjs — not astro.config.mjs, because the
// <Code> component only reads options from the standalone file:
//
//   import { likec4Language } from 'astroc4/expressive-code';
//   export default defineEcConfig({ shiki: { langs: [likec4Language] } });
//
// Then ```c4 fences, <Code lang="likec4">, and any embed that infers `likec4`
// from a .c4 extension are highlighted. A ```likec4 fence in .mdx is still a
// diagram — the alias is how you show source instead.

import grammar from './grammar/likec4.tmLanguage.json' with { type: 'json' };

/** @type {import('shiki').LanguageRegistration} */
export const likec4Language = {
	...grammar,
	name: 'likec4',
	aliases: ['c4'],
};

export default likec4Language;
