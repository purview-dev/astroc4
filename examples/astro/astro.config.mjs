// astro.config.mjs
// path: examples/astro/astro.config.mjs
// Plain Astro, no Starlight: the smallest site that renders a LikeC4 diagram,
// kept as a runnable example and as the thing `bun run check` type-checks.
//
//   bun run dev:astro      # http://localhost:4322
//   bun run build:astro
//
// Every specifier here is the one an installed site writes. Inside this
// repository they resolve through Node's package self-reference, because the
// repository root *is* the package.
//
// What the site adds itself:
//   - `@astrojs/mdx` — ```likec4 fences only become diagrams in `.mdx` pages;
//   - `astro-expressive-code` + `ec.config.mjs` — LikeC4 source highlighting.
//     Starlight has an `expressiveCode` option the plugin fills in; Astro does
//     not, so the site configures Expressive Code itself.
//
// There is no `react()` here on purpose: `astroc4()` adds `@astrojs/react` when
// the site has no React renderer, because the islands are `client:only="react"`
// and nothing renders without one. Add it yourself if you prefer it explicit.
//
// `astroExpressiveCode()` must come before `mdx()` — that is Expressive Code's
// own requirement, and it says so if you get it wrong. Its position relative to
// `astroc4()` does not matter, so this example puts it *first*: the harder order
// is the one worth building on every run.

import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';

import astroc4 from '@purview-dev/astroc4/integration';

export default defineConfig({
	integrations: [expressiveCode(), astroc4(), mdx()],
});
