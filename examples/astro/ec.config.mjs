// ec.config.mjs
// path: examples/astro/ec.config.mjs
// Expressive Code's own config file — the plain-Astro replacement for
// Starlight's `expressiveCode` option, where the Starlight plugin injects the
// LikeC4 grammar for you. `likec4Language` is the bundled snapshot, so this
// needs no network; `loadLikeC4Language({ ref })` fetches a different one.

import { defineEcConfig } from 'astro-expressive-code';

import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineEcConfig({
	shiki: { langs: [likec4Language] },
});
