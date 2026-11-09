// Plain Astro, no Starlight: the smallest site that renders a LikeC4 diagram.
//
// `astroc4()` adds `@astrojs/react` itself. Highlighting is the site's: Astro has
// no `expressiveCode` option for the plugin to fill in. Expressive Code is
// listed before `astroc4()` on purpose — the order must not matter, and this is
// the harder one.

import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';

import astroc4 from '@purview-dev/astroc4/integration';
import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineConfig({
	integrations: [expressiveCode({ shiki: { langs: [likec4Language] } }), astroc4(), mdx()],
});
