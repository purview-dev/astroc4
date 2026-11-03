# astroc4

A Starlight plugin for interactive [LikeC4](https://likec4.dev) architecture
diagrams.

- `<LikeC4View viewId="…" />` — render a view from the site's `.c4` model.
- ` ```likec4 ` fences in `.mdx` — either inline DSL, compiled and laid out at
  build time, or an empty fence with `view="…"` pointing at the model.
- LikeC4 syntax highlighting for Expressive Code (`.c4` files, ` ```c4 `),
  derived at build time from the Langium grammar in
  [likec4/likec4](https://github.com/likec4/likec4) — no `ec.config.mjs`.
- Every UI string translatable through Starlight's i18n.

Full documentation lives in [`docs/wiki`](docs/wiki/index.md) (published with
`mkdocs.yml`).

## Install

```sh
bun add @purview-dev/astroc4@prerelease      # 1.0.0-prerelease.N
```

Published to npm under the `prerelease` dist-tag, so `bun add @purview-dev/astroc4` keeps
resolving the last stable release. Astroc4 declares its peer dependencies, so
Bun and npm install them with it; under pnpm add them explicitly (`astro`,
`@astrojs/starlight`, `@astrojs/react`, `@astrojs/markdown-satteri`, `likec4`,
`@likec4/core`, `react`, `react-dom`, `shiki`).

Working on astroc4 itself? `bun add @purview-dev/astroc4@file:../path/to/astroc4` copies the
package into `node_modules`, so run `bun install` in the site again after
changing the plugin.

## Use

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
| `highlighting` | `true` | Highlight LikeC4 source. See below. |

### Syntax highlighting

The plugin reads `packages/language-server/src/like-c4.langium` from
`likec4/likec4`, derives a TextMate grammar from it, and registers that with
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
bundled grammar there instead:

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

Add any key from `src/translations.mjs` to the site's
`src/content/i18n/<lang>.json`. Placeholders are `{name}` — single braces,
because some are filled in by the browser, not by i18next.

## Icons

Use a bundled pack (`azure:`, `aws:`, `gcp:`, `tech:`, `bootstrap:`), an
absolute URL, or a file under the site's `public/` referenced by a path
relative to the `.c4` file. Don't use LikeC4's `imageAliases`: the compiler
bakes a build-machine `file://` path into the client bundle.

## Develop

```sh
bun install
bun run dev            # playground at http://localhost:4321 (English + French)
bun run test           # hermetic unit suite: Langium parsing, grammar, fences, plugin
bun run test:network   # the same, plus a check against the live likec4/likec4
bun run test:site      # pack the tarball and build a real Starlight site from it
bun run check          # astro check over playground/ and src/
bun run grammar:check  # fail if the committed grammar snapshot is stale
bun run build && bun run preview
bun scripts/smoke.mjs http://localhost:4321   # headless: hydration, icons, highlighting, i18n
```

`Justfile` wraps each of those (`just verify` runs what the PR workflow runs).
`src/grammar/likec4.tmLanguage.json` and `src/grammar/like-c4.langium` are
generated — `bun run grammar:sync [--ref <tag>]` refreshes them from upstream,
and never by hand.

CI lives in `.github/workflows`: `pr.yml` runs the organisation gate plus the
unit suite, the browser smoke test and the packed-consumer build; `release.yml`
publishes to npm with **trusted publishing** — an OIDC token, no stored npm
secret — under the `prerelease` dist-tag for prerelease versions, then tags the
release. See [`docs/wiki/Repository-CI-CD.md`](docs/wiki/Repository-CI-CD.md).

Open the folder in VS Code and install the recommended **LikeC4** extension
for the language server: diagnostics, go-to-definition, hover and a live
preview of `.c4` files.
