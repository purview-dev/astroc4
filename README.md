[![npm version](https://img.shields.io/npm/v/@purview-dev/astroc4.svg)](https://www.npmjs.com/package/@purview-dev/astroc4)

# astroc4

Interactive [LikeC4](https://likec4.dev) architecture diagrams for Astro and
Starlight.

- `<LikeC4View viewId="…" />` — render a view from the site's `.c4` model.
- ` ```likec4 ` fences in `.md` and `.mdx` — inline DSL or a `.c4` file, compiled
  and laid out at build time, or an empty fence with `view="…"` pointing at the
  model.
- Projects from anywhere: discovered under the site root, or named in the
  options, with any LikeC4 config file (`likec4.config.json`, `.likec4rc`,
  `likec4.config.ts`, …) and their `imageAliases` unchanged.
- LikeC4 syntax highlighting for Expressive Code (` ```c4 `), derived at build
  time from the Langium grammar in [likec4/likec4](https://github.com/likec4/likec4)
  — no Expressive Code config under Starlight.
- Every UI string translatable through Starlight's i18n, and every colour a
  `--likec4-*` token a site can set.

It works in **plain Astro** as well: `@purview-dev/astroc4/integration` is an
`AstroIntegration` that adds the same model compiler and fence transform. See
[Plain Astro](docs/wiki/guide/Plain-Astro.md) and the runnable example in
[`examples/astro`](examples/astro).

Full documentation lives in [`docs/wiki`](docs/wiki/README.md), grouped into
`guide/` and `contributing/`.

## Install

```sh
bun add @purview-dev/astroc4
```

Only prereleases (`1.0.0-prerelease.N`) are published so far; `latest` and
`prerelease` both point at the newest one, and `@prerelease` will keep tracking
prereleases once a stable version ships. Astroc4 declares its peer dependencies,
so Bun and npm install them with it; under pnpm add them explicitly (`astro`,
`@astrojs/react`, `@astrojs/markdown-satteri`, `likec4`, `@likec4/core`,
`react`, `react-dom`, `shiki`, and `@astrojs/starlight` if you use the plugin —
Starlight is an optional peer, because plain Astro does not need it).

`astro add @purview-dev/astroc4` wires the **plain-Astro** shape for you: it
installs the package and writes `integrations: [astroc4()]`, which works because
the default export implements the Astro integration protocol too. In a Starlight
site move that call into `starlight({ plugins: [astroc4()] })`; left in
`integrations`, the diagrams still render but the translated UI and LikeC4
highlighting do not, and the plugin warns about it.

## Use

### With Starlight

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import astroc4 from '@purview-dev/astroc4';

export default defineConfig({
	integrations: [starlight({ title: 'My docs', plugins: [astroc4()] })],
});
```

```mdx
import LikeC4View from '@purview-dev/astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
```

`@astrojs/react` is added for you when the site has no React renderer (the
islands are `client:only="react"`); list `react()` yourself if you prefer it
explicit.

### With Astro (no Starlight)

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import astroc4 from '@purview-dev/astroc4/integration';
import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineConfig({
	// Expressive Code must come before mdx() — its own requirement.
	integrations: [expressiveCode({ shiki: { langs: [likec4Language] } }), astroc4(), mdx()],
});
```

The site supplies `@astrojs/mdx` (for `<LikeC4View>` and fences in `.mdx`;
fences in plain `.md` work without it) and, for highlighting,
`astro-expressive-code` given `likec4Language` — Starlight has an
`expressiveCode` option for the plugin to fill in, Astro does not.
[`examples/astro`](examples/astro) is a working site with exactly this config
(`bun run dev:astro`).

### Projects

A diagram comes from one of three places:

- **A discovered project** — every folder under the site root with a LikeC4
  config file. All of LikeC4's names are read, the way LikeC4 reads them:
  `.likec4rc`, `.likec4.config.json` and `likec4.config.json` as JSON5,
  `likec4.config.{ts,mts,cts,js,mjs,cjs}` bundled with esbuild. The project is
  named by its config's `name`, or after its folder.
- **A named project** — `projects: { <name>: <folder> }` adds LikeC4 projects
  from anywhere: a sibling folder, another checkout, an absolute path. The key is
  the name pages use. The project's own config, model and icons are used exactly
  as they are.
- **A single file** — `<LikeC4View file="diagrams/flow.c4">`, or a fence's
  `file="…"`, compiled at build time like an inline fence.

```ts
// src/likec4/likec4.config.ts
import { defineConfig } from 'likec4/config';

export default defineConfig({ name: 'docs', imageAliases: { '@': './images' } });
```

```ts
starlight({
	plugins: [astroc4({ projects: { architecture: '../../docs/architecture/likec4' } })],
});
```

```mdx
<LikeC4View project="architecture" viewId="c1-context" />
```

With exactly one project, `project` may be left out. With more than one,
leaving it out fails the build and lists the names — for `<LikeC4View>` and
empty fences, in `.md` and `.mdx` alike. An unknown name fails the build the same
way. Two projects with the same name, or whose configs declare the same `name`,
fail the build naming both folders.

Named projects are compiled through links in `.astro/astroc4/workspace` (Astro's
cache folder, which Astro sites already ignore); edits to their `.c4` files
reload in `astro dev` like any other.

### Options

| Option | Default | |
| --- | --- | --- |
| `projects` | `{}` | Named LikeC4 project folders, relative to the site root or absolute. See above. |
| `vitePlugin` | `{}` | Passed to `LikeC4VitePlugin`. Setting `workspace` or `languageServices` takes discovery over: `projects` is then ignored (with a warning). |
| `fences` | `true` | Turn ` ```likec4 ` fences into diagrams. |
| `validation` | `'strict'` | Whether a fence that cannot be drawn (bad DSL, missing view, bad `project`, unresolved `file=`) fails the build or only warns. `'relaxed'` warns and leaves it as a highlighted code block; `{ default, collections, relaxed: [globs] }` scopes it by collection or path. See [Fences](docs/wiki/guide/Fences.md#partial-and-invalid-examples). |
| `highlighting` | `true` | Highlight LikeC4 source. Starlight only — a plain Astro site passes `likec4Language` to Expressive Code. See below. |

### Syntax highlighting

Under Starlight the plugin reads `packages/language-server/src/like-c4.langium`
from `likec4/likec4`, derives a TextMate grammar from it, and registers that with
the site's Expressive Code — so ` ```c4 ` fences, ` ```likec4 ` source and
`<Code lang="likec4">` all highlight with no configuration. Highlighting
follows the language: when upstream adds a shape or a keyword, the next build
picks it up.

```ts
starlight({
	plugins: [
		astroc4({
			highlighting: {
				ref: 'v1.60.0', // branch, tag or commit SHA; default 'main'
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
| `baseUrl` | `https://raw.githubusercontent.com` | Raw host to read from. |
| `timeout` | `15000` | Request timeout in milliseconds. |

`ASTROC4_REF` overrides `ref`, and `ASTROC4_OFFLINE=1` stands in for `offline`
when the config does not set it, which keeps CI configuration out of the config
file.

The grammar is resolved while Astro loads its config, so `astro dev`,
`astro build`, `astro check` and `astro sync` all fail on a `ref` that does not
exist, on a repository that cannot be reached, or on a file that is no longer a
LikeC4 grammar — the same way any other build error does. Air-gapped builds use
`offline: true`; builds that must not hard-fail use `onError: 'warn'`, which
falls back to the last fetched grammar and then to the bundled snapshot.

A Starlight site that already has an `ec.config.mjs` keeps working: Expressive
Code concatenates `shiki.langs` when it merges that file with the plugin's
options, so its own languages and LikeC4 coexist.

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
fails the build. A single file has no config, so it has no `imageAliases`: use a
pack, a URL or a `public/` icon there.

### Fence options

` ```likec4 view="…" project="…" file="…" title="…" description="…" height=420 collapsible=false defaultOpen=false `

`file` is relative to the Markdown page and must stay inside the site. Fences in
`.md` and `.mdx` take the same options; in `.md` the UI strings are English.

### Styling

Set any token on an ancestor — `:root` works on any site:

```css
:root {
	--likec4-border: #d4d4d8;
	--likec4-accent: #0046be;
}
```

`--likec4-border`, `-surface`, `-surface-alt`, `-text`, `-text-muted`,
`-accent`, `-skeleton`, `-danger`, `-danger-soft` and `-danger-text`. Unset,
they fall back to Starlight's `--sl-color-*`, then to neutral greys. See
[Components](docs/wiki/guide/Components.md#styling).

### Translating

Add any key from `src/translations.ts` to the site's
`src/content/i18n/<lang>.json`. Placeholders are `{name}` — single braces,
because some are filled in by the browser, not by i18next.

## Icons

Every form LikeC4 accepts works, in discovered and named projects alike:

- a bundled pack (`azure:`, `aws:`, `gcp:`, `tech:`, `bootstrap:`, `md:`);
- an absolute URL;
- `imageAliases` from the project's config — `"@": "../../.assets/images"` and
  `icon @/azure/entra.svg` — with no change to the project;
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
| Build fails with `…likec4.config… could not be read` | The config does not parse (JSON5) or does not bundle (JS/TS). | Fix the error after the path; a JS/TS config's imports other than `likec4/config` must resolve from its folder. |
| A diagram shows "Unknown LikeC4 projectId" | Only on a site that sets `vitePlugin.workspace` itself, where astroc4 does not know the projects. | Pass a `project` the workspace contains. |
| `Cannot find module …/@purview-dev/astroc4/dist/index.js` | That version shipped without its build output (only `1.0.0-prerelease.3` did). | Move to `1.0.0-prerelease.4` or later. |

Everything else — highlighting that produces one colour, fences left as code,
Windows module-runner crashes — is in
[Troubleshooting](docs/wiki/Troubleshooting.md).

## Develop

```sh
bun install
bun run dev            # Starlight playground at http://localhost:4321 (English + French)
bun run dev:astro      # plain-Astro example at http://localhost:4322
bun run test           # hermetic unit suite: config loading, grammar, fences, plugin
bun run test:network   # the live check against likec4/likec4
bun run test:site      # pack the tarball, install it into copies of playground/ and
                       # examples/astro/, build both, run the full smoke suite against
                       # the Starlight copy, and check the plain one hydrates
bun run check          # astro check over playground/, examples/astro/ and src/, tsc over scripts/
bun run grammar:check  # fail if the committed grammar snapshot is stale
bun run build && bun run preview
bun run build:astro    # static build of the plain-Astro example
bun scripts/smoke.ts http://localhost:4321   # headless: hydration, icons, highlighting, i18n
bun scripts/hydration.ts http://localhost:4321  # headless: one diagram, nothing else
```

The source is TypeScript throughout, configs included (`astro.config.ts`), with
`.ts` relative imports; `bun run build:lib` bundles it into `dist/`.
`playground/` is the Starlight development site; `examples/astro/` is the
plain-Astro one, and `test:site` copies it so the checked-in example is what the
suite builds. Both import the package by name — Node's self-reference resolves
it from the repository, which *is* the package.

`test:site` and the two browser scripts need Chromium
(`bunx playwright install chromium`).

`Justfile` wraps each of those (`just verify` runs the PR gate's chain plus
`test:site`). `src/grammar/likec4.tmLanguage.json` and
`src/grammar/like-c4.langium` are generated — `bun run grammar:sync [--ref <tag>]`
refreshes them from upstream, and never by hand.

CI lives in `.github/workflows`: `pr.yml` runs the organisation gate (grammar
snapshot, type-check, build, unit suite), the live grammar check, the browser
smoke test and the packed-consumer build; `release.yml` publishes to npm with
**trusted publishing** — an OIDC token, no stored npm secret — under the
`prerelease` dist-tag for prerelease versions, then tags the release. See
[`docs/wiki/contributing/Repository-CI-CD.md`](docs/wiki/contributing/Repository-CI-CD.md).

Open the folder in VS Code and install the recommended **LikeC4** extension
for the language server: diagnostics, go-to-definition, hover and a live
preview of `.c4` files.
