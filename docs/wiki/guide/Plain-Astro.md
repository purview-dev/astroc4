# Plain Astro (no Starlight)

Astroc4 ships two entry points that share one implementation:

| Import | Use it in | What it is |
| --- | --- | --- |
| `@purview-dev/astroc4` | `starlight({ plugins: [astroc4()] })` | The Starlight plugin: the integration below **plus** UI-string injection and LikeC4 syntax highlighting. |
| `@purview-dev/astroc4/integration` | `integrations: [astroc4(), …]` | An `AstroIntegration`: the `.c4` compiler, the fence transform, and the dev-mode fixes. |

Both add the same things to a site — `LikeC4VitePlugin`, the ` ```likec4 ` fence
transform on Astro's Markdown processor and the page script that mounts `.md`
fences, the icon and single-file plugins, the build-time preload,
`react/compiler-runtime` in `vite.optimizeDeps.include`, and `@astrojs/react`
when it is missing — because both call the file that implements them. Nothing
Starlight-specific leaks into a plain site.

A runnable example lives in [`examples/astro`](https://github.com/purview-dev/astroc4/tree/main/examples/astro):
one page, one model, no Starlight. `bun run dev:astro` serves it on
<http://localhost:4322>.

## The whole configuration

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';

import astroc4 from '@purview-dev/astroc4/integration';
import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineConfig({
	integrations: [expressiveCode({ shiki: { langs: [likec4Language] } }), astroc4(), mdx()],
});
```

`astro add @purview-dev/astroc4` saves you that first line — it writes
`integrations: [astroc4()]`, importing the package's **default export**, which
implements the Astro integration protocol as well as the Starlight plugin one.
`@purview-dev/astroc4/integration` is the same thing without the compatibility
layer, and is what the rest of this page uses.

Three things are the site's to provide, not the integration's:

| Integration | Why |
| --- | --- |
| `@astrojs/mdx` | Only for `<LikeC4View>` in a page, or fences in `.mdx`. ` ```likec4 ` fences in plain `.md` render without it. |
| `astro-expressive-code` | Only if you want ` ```c4 ` highlighted. Starlight ships it; plain Astro does not. |
| `@astrojs/markdown-satteri` | Astro 7's default processor, and what the fence transform plugs into. It is a peer dependency, so Bun and npm install it with the package. |

`@astrojs/react` is not on that list because `astroc4()` adds it: the islands are
`client:only="react"`, so a site without a React renderer builds and then draws
nothing. The integration checks `integrations` for `@astrojs/react` and, if it is
absent, adds it — Astro runs the hooks of integrations added during
`astro:config:setup`, which is the same mechanism Starlight uses for Expressive
Code. Add `react()` yourself if you prefer the config explicit; it will not be
added twice. If the package is not installed (it is a peer dependency, so it
should be), the log says so instead of failing on the first diagram.

### Ordering

Only one rule is real: **`astroExpressiveCode()` before `mdx()`**, which
`astro-expressive-code` enforces itself with an error message. The order of
`astroc4()` relative to either does not matter — Astro applies a processor's
mdast plugins and the site's `markdown.rehypePlugins` (which is how Expressive
Code attaches itself when it runs before a processor exists), so highlighting and
fences work in either order. `examples/astro` is built and asserted with
Expressive Code listed *first* to keep that honest.

## Highlighting

Starlight has an `expressiveCode` option that the plugin fills in for you. Astro
does not, so a plain site gives Expressive Code the grammar itself, in the
options above: `expressiveCode({ shiki: { langs: [likec4Language] } })`. The
grammar is plain JSON, so the `<Code>` component receives it too. (Expressive
Code also reads an `ec.config.mjs`. That file name is fixed, so a TypeScript site
passes the options inline instead.)

`likec4Language` is the grammar snapshot bundled with the package, so this needs
no network. `await loadLikeC4Language({ ref: 'v1.60.0' })` fetches a different
one when the config is asynchronous, and
[Syntax Highlighting](Syntax-Highlighting.md#choosing-a-version) covers the
trade-off.

## What you give up

- **Translations.** `Astro.locals.t` is Starlight's; without it the components
  render English. They are built for that — `getTranslator()` falls back to
  English rather than throwing — so nothing breaks, it just does not translate.
- **The `highlighting` option.** There is no `expressiveCode` option to inject
  into; pass `likec4Language` to `expressiveCode()` as above.

`astro add` is not on that list: it writes `integrations: [astroc4()]` from the
package's default export, which works here. It cannot add the other integrations
or the `likec4Language` option, so the config above is still what you end up with — and in
a *Starlight* site it writes the wrong shape, which the plugin warns about.

## Styling without Starlight's tokens

The components are styled from `--sl-color-*` where it exists, and from their own
`--likec4-*` fallbacks otherwise — translucent greys and `inherit`, so the frame
is legible on light and dark pages alike. On Starlight nothing changes; on a plain
site the chrome is neutral until you give it colours, on any ancestor:

```css
:root {
	--likec4-border: #d4d4d8;
	--likec4-surface: #ffffff;
	--likec4-surface-alt: #f6f6f7;
	--likec4-text: #18181b;
	--likec4-text-muted: #52525b;
	--likec4-accent: #0046be;
}
```

`examples/astro` sets `--likec4-accent` this way, and `test:site` asserts the
hint picks it up in a browser. [Components](Components.md#overriding-the-colours)
lists every token and class.

## Proving it works

`bun run test:site` packs the tarball and builds **two** consumer sites from it:
a copy of the Starlight playground and a plain-Astro one copied from
`examples/astro`. Both go through `astro check` and `astro build`. The Starlight
copy then runs the full smoke suite on its preview server. The plain one runs
`hydration.ts` on its **dev server**: it waits for a rendered element node, fails
if the loading placeholder survives, checks the fallback styling and the site's
`--likec4-accent` override, and fails on
any console error. The plain site is then rebuilt in the shape `astro add` writes.
A green `astro build` alone is not proof that a diagram renders — see
[Troubleshooting](../Troubleshooting.md#diagrams-stay-blank-while-the-build-passes).

Back to the [guide index](README.md).
