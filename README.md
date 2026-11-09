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

### Projects

A diagram comes from one of three places:

- **A discovered project** — every `likec4.config.json` under the site root is
  compiled, as before, and named by the `name` in its config.
- **A named project** — `projects: { <name>: <folder> }` adds LikeC4 projects
  from anywhere: a sibling folder, another checkout, an absolute path. The key is
  the name pages use. The project's own config, model and icons are used exactly
  as they are.
- **A single file** — `<LikeC4View file="diagrams/flow.c4">`, or a fence's
  `file="…"`, compiled at build time like an inline fence.

```js
starlight({
	plugins: [astroc4({ projects: { architecture: '../../docs/architecture/likec4' } })],
});
```

```mdx
<LikeC4View project="architecture" viewId="c1-context" />
```

With exactly one project, `project` may be left out. With more than one,
leaving it out fails the build and lists the names — a reorder or a stray
vendored model can no longer change which diagram a page shows. An unknown name
fails the build the same way. Two projects with the same name, or whose configs
declare the same `name`, fail the build naming both folders.

Named projects are compiled through links in `.astro/astroc4/workspace` (Astro's
cache folder, which Astro sites already ignore); edits to their `.c4` files
reload in `astro dev` like any other.

### Options

| Option | Default | |
| --- | --- | --- |
| `projects` | `{}` | Named LikeC4 project folders, relative to the site root or absolute. See above. |
| `vitePlugin` | `{}` | Passed to `LikeC4VitePlugin`. Setting `workspace` or `languageServices` takes discovery over: `projects` is then ignored (with a warning). |
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
| `project` | `string` | the only project; required when there are several |
| `file` | `string` | a `.c4` file relative to `src/`, instead of a project |
| `projectId` | `string` | deprecated alias of `project` |
| `title` / `description` | `string` | translated defaults |
| `height` | `number` | `480` |
| `collapsible` / `defaultOpen` | `boolean` | `true` |

`file` must name a `.c4` file under the site's `src/` folder; anything else
fails the build. A single file has no `likec4.config.json`, so it has no
`imageAliases`: use a pack, a URL or a `public/` icon there.

### Fence options

` ```likec4 view="…" project="…" file="…" title="…" description="…" height=420 collapsible=false defaultOpen=false `

`file` is relative to the Markdown page and must stay inside the site.

### Translating

Add any key from `src/translations.ts` to the site's
`src/content/i18n/<lang>.json`. Placeholders are `{name}` — single braces,
because some are filled in by the browser, not by i18next.

## Icons

Every form LikeC4 accepts works, in discovered and named projects alike:

- a bundled pack (`azure:`, `aws:`, `gcp:`, `tech:`, `bootstrap:`);
- an absolute URL;
- `imageAliases` from the project's `likec4.config.json` — `"@": "../../.assets/images"`
  and `icon @/azure/entra.svg` — with no change to the project;
- a path relative to the `.c4` file, inside or outside the project.

Local files are rendered by LikeC4 itself (SVGs inline) and also served at
`/_astroc4/<project>/<path>` — `@/azure/entra.svg` becomes
`/_astroc4/architecture/azure/entra.svg`, a named alias `@brand` adds a `brand/`
segment — and copied into the build output. Files under `public/` keep their
public URL. No `file://` path from the build machine reaches the bundle, and an
icon that does not exist fails the build. Nothing is written into your source
tree.

## Troubleshooting

**A green `astro build` is not proof that a diagram renders.** The islands are
`client:only` React, so a build can succeed while every frame stays on "Loading
architecture diagram…" — open the page in `astro dev`, or run
`bun scripts/smoke.ts` / `bun scripts/hydration.ts <url>` against it.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `The requested module '/node_modules/react/compiler-runtime.js' does not provide an export named 'c'` in the console, diagrams stuck on the loading placeholder | `likec4/react` (1.59.4 and later) is compiled with the React Compiler and imports `c` from React 19's CommonJS `react/compiler-runtime`; in dev Vite serves it unoptimized, so the island never mounts. Production builds bundle it, which is why the build still passes. | Fixed in `1.0.0-prerelease.5`: the plugin adds `react/compiler-runtime` to `vite.optimizeDeps.include`. On an older version, or to confirm by hand: `vite: { optimizeDeps: { include: ['react/compiler-runtime'] } }`. |
| Build fails with `could not fetch the LikeC4 grammar from https://raw.githubusercontent.com/…` | The grammar is resolved while the config loads, and the machine cannot reach GitHub. | `highlighting: { offline: true }` (bundled snapshot) or `onError: 'warn'`; `ASTROC4_OFFLINE=1` in CI. |
| Build fails with `Several LikeC4 projects exist (…); pass project="…"` | The site has more than one project (discovered or named) and a `<LikeC4View>` or fence names none. | Pass `project="<name>"`; the message lists the names. |
| Build fails with `two LikeC4 projects are named "…"` | A named project and a discovered one, or two folders, share a name or a config `name`. | Rename one, or name the configured project differently. |
| `<LikeC4View>` shows "Unknown LikeC4 projectId" | Only on a site that sets `vitePlugin.workspace` itself, where astroc4 does not know the projects. | Pass a `project` the workspace contains. |
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
