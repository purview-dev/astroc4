// ec.config.mjs
// path: playground/ec.config.mjs
// How a host site enables LikeC4 highlighting — see src/expressive-code.mjs.

import { defineEcConfig } from '@astrojs/starlight/expressive-code';

import { likec4Language } from '../src/expressive-code.mjs';

export default defineEcConfig({
	shiki: { langs: [likec4Language] },
});
