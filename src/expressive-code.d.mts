// expressive-code.d.mts
// path: src/expressive-code.d.mts
// Types for src/expressive-code.mjs — see src/index.d.mts for why they exist.

import type { LanguageRegistration } from 'shiki';

/** Shiki registration for LikeC4, under `likec4` with a `c4` alias. */
export declare const likec4Language: LanguageRegistration & { aliases: string[] };

/**
 * Resolve the grammar from likec4/likec4 at the requested ref and return it as
 * a Shiki language registration.
 */
export declare function loadLikeC4Language(options?: {
	ref?: string;
	repo?: string;
	offline?: boolean;
	onError?: 'fail' | 'warn' | 'silent';
	cacheTtl?: number;
	refresh?: boolean;
	cacheDir?: string;
	baseUrl?: string;
	timeout?: number;
	root?: string;
}): Promise<LanguageRegistration & { aliases: string[] }>;

export default likec4Language;

