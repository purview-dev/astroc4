[![npm version](https://img.shields.io/npm/v/@purview-dev/astroc4.svg)](https://www.npmjs.com/package/@purview-dev/astroc4)

# astroc4

Interactive [LikeC4](https://likec4.dev) architecture diagrams for Astro and
Starlight.

- `<LikeC4View viewId="…" />` — render a view from the site's `.c4` model.
- ` ```likec4 ` fences in `.mdx` — either inline DSL, compiled and laid out at
  build time, or an empty fence with `view="…"` pointing at the model.
- LikeC4 syntax highlighting for Expressive Code (`.c4` files, ` ```c4 `),
  derived at build time from the Langium grammar in
  [likec4/likec4](https://github.com/likec4/likec4) — no `ec.config.mjs` under
  Starlight.
- Every UI string translatable through Starlight's i18n.

It works in **plain Astro** as well: `@purview-dev/astroc4/integration` is an
`AstroIntegration` that adds the same model compiler and fence transform. See
[Plain Astro](docs/wiki/guide/Plain-Astro.md) and the runnable example in
[`examples/astro`](examples/astro).

Full documentation lives in [`docs/wiki`](docs/wiki/README.md), grouped into
`guide/` and `contributing/`.

## Install

```sh
bun add @purview-dev/astroc4@prerelease      # 1.0.0-prerelease.N
```

Published to npm under the `prerelease` dist-tag, so `bun add @purview-dev/astroc4` keeps
resolving the last stable release. Astroc4 declares its peer dependencies, so
Bun and npm install them with it; under pnpm add them explicitly (`astro`,
`@astrojs/react`, `@astrojs/markdown-satteri`, `likec4`, `@likec4/core`,
`react`, `react-dom`, `shiki`, and `@astrojs/starlight` if you use the plugin —
Starlight is an optional peer, because plain Astro does not need it).

`astro add @purview-dev/astroc4` wires the **plain-Astro** shape for you: it
installs the package (and the non-optional peers) and writes
`integrations: [astroc4()]`, which works because the default export implements
the Astro integration protocol too. In a Starlight site the CLI cannot know
better — it writes the same thing — so move that call into
`starlight({ plugins: [astroc4()] })`; left in `integrations`, the diagrams still
render but the translated UI and LikeC4 highlighting do not, and the plugin warns
about it.

(`astro`'s integrations library indexes npm by keyword, and this package carries
`astro-integration` with `ui` for a category.)

Working on astroc4 itself? `bun add @purview-dev/astroc4@file:../path/to/astroc4` copies the
package into `node_modules`, so run `bun install` in the site again after
changing the plugin.

## Use

### With Starlight

```js
// astro.config.mjs
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import astroc4 from '@purview-dev/astroc4';

export default defineConfig({
  integrations: [starlight({ plugins: [astroc4()] }), react()],
});
```

```mdx
import LikeC4View from '@purview-dev/astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
```

### With Astro (no Starlight)

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import astroc4 from '@purview-dev/astroc4/integration';

export default defineConfig({
  // astroExpressiveCode() must come before mdx() — its own requirement.
  integrations: [astroc4(), expressiveCode(), mdx()],
});
```

The page is the same `<LikeC4View>` import. Two things the site supplies:
`@astrojs/mdx` (` ```likec4 ` fences only become diagrams in `.mdx`), and
`astro-expressive-code` plus an `ec.config.mjs` that registers `likec4Language`
when you want ` ```c4 ` highlighted — Starlight has an `expressiveCode` option for
the plugin to fill in, Astro does not.

`react()` is **not** on that list: `astroc4()` adds `@astrojs/react` when the
site has no React renderer, because the islands are `client:only="react"` and
nothing renders without one. [Plain Astro](docs/wiki/guide/Plain-Astro.md) has
the full walkthrough, and [`examples/astro`](examples/astro) is a working site
with exactly this config (`bun run dev:astro`).

`astro add @purview-dev/astroc4` writes the `astroc4()` line for you in this
shape; you still add the other integrations (`astro add mdx
astro-expressive-code`) and the `ec.config.mjs`.

The plugin registers `LikeC4VitePlugin`, which compiles every
`likec4.config.json` project under the site root. Keep exactly the projects you
mean to render there: the first one found is the default for `<LikeC4View>`
without a `projectId`, so a stray `.c4` project (a vendored example, say) can
silently replace your own.

### Options

| Option | Default | |
| --- | --- | --- |
| `vitePlugin` | `{}` | Passed to `LikeC4VitePlugin`, e.g. `{ workspace: 'diagrams' }`. |
| `fences` | `true` | Turn ` ```likec4 ` fences into diagrams. |
| `highlighting` | `true` | Highlight LikeC4 source. Starlight only — a plain Astro site uses `ec.config.mjs`. See below. |

### Syntax highlighting

Under Starlight the plugin reads `packages/language-server/src/like-c4.langium`
from `likec4/likec4`, derives a TextMate grammar from it, and registers that with
the site's Expressive Code — so ` ```c4 ` fences, ` ```likec4 ` fences and
`<Code lang="likec4">` all highlight with no configuration. Highlighting
follows the language: when upstream adds a shape or a keyword, the next build
picks it up.

```js
starlight({
	plugins: [
		astroc4({
			highlighting: {
				ref: 'v1.59.4', // branch, tag or commit SHA; default 'main'
			},
		}),
	],
});
```

| Option | Default | |
| --- | --- | --- |
| `ref` | `'main'` | Branch, tag or commit SHA. Pin a tag or SHA for reproducible CI. |
| `repo` | `'likec4/likec4'` | Read the grammar from a fork or mirror. |
| `offline` | `false` | Use the bundled snapshot, never the network. |
| `onError` | `'fail'` | `fail`, `warn` or `silent` when the grammar cannot be fetched. |
| `cacheTtl` | `3600` | Seconds a cached fetch stays fresh. |
| `refresh` | `false` | Ignore the cache and refetch. |
| `cacheDir` | `node_modules/.cache/astroc4` | Where to cache. |
| `baseUrl` | `raw.githubusercontent.com` | Raw host to read from. |
| `timeout` | `15000` | Request timeout in milliseconds. |

`ASTROC4_REF` and `ASTROC4_OFFLINE=1` override `ref` and `offline`, which keeps
CI configuration out of the config file.

The grammar is resolved while Astro loads its config, so `astro dev`,
`astro build`, `astro check` and `astro sync` all fail on a `ref` that does not
exist, on a repository that cannot be reached, or on a file that is no longer a
LikeC4 grammar — the same way any other build error does. Air-gapped builds use
`offline: true`; builds that must not hard-fail use `onError: 'warn'`, which
falls back to the last fetched grammar and then to the bundled snapshot.

Fetched grammars are cached per `repo@ref`, so switching `ref` never thrashes
and repeated builds do not touch the network.

A site that already has an `ec.config.mjs` keeps working, and can pin the
bundled grammar there instead — which is also what a plain Astro site does:

```js
// ec.config.mjs
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineEcConfig({ shiki: { langs: [likec4Language] } });
```

Expressive Code concatenates `shiki.langs` when it merges an `ec.config.mjs`
with the integration options, so its own languages and the plugin's coexist.

### `<LikeC4View>` props

| Prop | Type | Default |
| --- | --- | --- |
| `viewId` | `string` | required |
| `projectId` | `string` | first project |
| `title` / `description` | `string` | translated defaults |
| `height` | `number` | `480` |
| `collapsible` / `defaultOpen` | `boolean` | `true` |

### Fence options

` ```likec4 view="…" title="…" description="…" height=420 collapsible=false defaultOpen=false `

### Translating

Add any key from `src/translations.ts` to the site's
`src/content/i18n/<lang>.json`. Placeholders are `{name}` — single braces,
because some are filled in by the browser, not by i18next.

## Icons

Use a bundled pack (`azure:`, `aws:`, `gcp:`, `tech:`, `bootstrap:`), an
absolute URL, or a file under the site's `public/` referenced by a path
relative to the `.c4` file. Don't use LikeC4's `imageAliases`: the compiler
bakes a build-machine `file://` path into the client bundle.

## Troubleshooting

**A green `astro build` is not proof that a diagram renders.** The islands are
`client:only` React, so a build can succeed while every frame stays on "Loading
architecture diagram…" — open the page in `astro dev`, or run
`bun scripts/smoke.ts` / `bun scripts/hydration.ts <url>` against it.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `The requested module '/node_modules/react/compiler-runtime.js' does not provide an export named 'c'` in the console, diagrams stuck on the loading placeholder | `likec4/react` (1.59.4 and later) is compiled with the React Compiler and imports `c` from React 19's CommonJS `react/compiler-runtime`; in dev Vite serves it unoptimized, so the island never mounts. Production builds bundle it, which is why the build still passes. | Fixed in `1.0.0-prerelease.5`: the plugin adds `react/compiler-runtime` to `vite.optimizeDeps.include`. On an older version, or to confirm by hand: `vite: { optimizeDeps: { include: ['react/compiler-runtime'] } }`. |
| Build fails with `could not fetch the LikeC4 grammar from https://raw.githubusercontent.com/…` | The grammar is resolved while the config loads, and the machine cannot reach GitHub. | `highlighting: { offline: true }` (bundled snapshot) or `onError: 'warn'`; `ASTROC4_OFFLINE=1` in CI. |
| `<LikeC4View>` shows "Unknown LikeC4 projectId" | Every `.c4` project under the site root is compiled and the first is the default, so a vendored model can take over. | Keep only the projects you render, pass `projectId`, or point `vitePlugin.workspace` at one directory. |
| `Cannot find module …/@purview-dev/astroc4/dist/index.js` | That version shipped without its build output (only `1.0.0-prerelease.3` did). | Move to `1.0.0-prerelease.4` or later. |

Everything else — highlighting that produces one colour, fences left as code,
Windows module-runner crashes — is in
[Troubleshooting](docs/wiki/Troubleshooting.md).

## Develop

```sh
bun install
bun run dev            # Starlight playground at http://localhost:4321 (English + French)
bun run dev:astro      # plain-Astro example at http://localhost:4322
bun run test           # hermetic unit suite: Langium parsing, grammar, fences, plugin
bun run test:network   # the same, plus a check against the live likec4/likec4
bun run test:site      # pack the tarball, install it into copies of playground/ and
                       # examples/astro/, build both, run the full smoke suite against
                       # the Starlight copy, and check the plain one hydrates
bun run check          # astro check over playground/, examples/astro/ and src/
bun run grammar:check  # fail if the committed grammar snapshot is stale
bun run build && bun run preview
bun run build:astro    # static build of the plain-Astro example
bun scripts/smoke.ts http://localhost:4321   # headless: hydration, icons, highlighting, i18n
bun scripts/hydration.ts http://localhost:4321  # headless: one diagram, nothing else
```

`playground/` is the Starlight development site; `examples/astro/` is the
plain-Astro one, and `test:site` copies it so the checked-in example is what the
suite builds. Both import the package by name — Node's self-reference resolves
it from the repository, which *is* the package.

`test:site` and the two browser scripts need Chromium
(`bunx playwright install chromium`).

`Justfile` wraps each of those (`just verify` runs what the PR workflow runs).
`src/grammar/likec4.tmLanguage.json` and `src/grammar/like-c4.langium` are
generated — `bun run grammar:sync [--ref <tag>]` refreshes them from upstream,
and never by hand.

CI lives in `.github/workflows`: `pr.yml` runs the organisation gate plus the
unit suite, the browser smoke test and the packed-consumer build; `release.yml`
publishes to npm with **trusted publishing** — an OIDC token, no stored npm
secret — under the `prerelease` dist-tag for prerelease versions, then tags the
release. See [`docs/wiki/contributing/Repository-CI-CD.md`](docs/wiki/contributing/Repository-CI-CD.md).

Open the folder in VS Code and install the recommended **LikeC4** extension
for the language server: diagnostics, go-to-definition, hover and a live
preview of `.c4` files.
