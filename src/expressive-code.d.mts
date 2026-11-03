// expressive-code.d.mts
// path: src/expressive-code.d.mts
// Types for src/expressive-code.mjs — see src/index.d.mts for why they exist.

import type { LanguageRegistration } from 'shiki';

/** Shiki registration for LikeC4, under `likec4` with a `c4` alias. */
export declare const likec4Language: LanguageRegistration & { aliases: string[] };

export default likec4Language;
