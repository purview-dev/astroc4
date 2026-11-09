## Development

Bun project. The package source is TypeScript in `src/`; there are two host
sites. `playground/` is a small Starlight site that consumes it, and
`examples/astro/` is the same thing in **plain Astro** (no Starlight) — both
import the package by name and resolve it through Node's self-reference. The
wiki in `docs/wiki/` is the published documentation — keep it in step with the
code. It is grouped into `guide/` (using the plugin) and `contributing/`
(changing it), each with a `README.md` index, plus `Troubleshooting.md` at the
root; new pages belong in one of those two folders.

```
bun run build:lib      # bundle src/ -> dist/ (+ .d.ts, grammar data)
bun run dev            # build:lib, then the Starlight playground on :4321
bun run dev:astro      # build:lib, then the plain-Astro example on :4322
bun run build          # build:lib, then the playground static build
bun run build:astro    # build:lib, then the plain-Astro static build
bun run test           # vitest: pure helpers, the Langium scanner, the grammar
bun run test:network   # + a live check against likec4/likec4
bun run test:site      # pack + install the tarball into a copy of playground/ and
                       # a copy of examples/astro/, then build both, run the full
                       # smoke suite against the Starlight copy, and check the
                       # plain one hydrates in Chromium
bun run check          # astro check (both sites and src/) + tsc for scripts
bun run grammar:check  # the committed grammar snapshot matches its derivation
```

`dev`, `build`, `check` and `test:site` all run `build:lib` first, because both
host sites import the plugin by package name, which resolves to `dist/` — the
artifact a site installs. Importing `../src/index.ts` there instead puts the
plugin inside the Vite module runner that loads `astro.config.ts`, and its dynamic `import()` of
`@astrojs/markdown-satteri` then dies with "module runner has been closed".
`examples/astro/astro.config.ts` imports `@purview-dev/astroc4/integration` and
its page imports `@purview-dev/astroc4/components/LikeC4View.astro`; inside this
repository those resolve the way an installed site resolves them, through
`package.json` `exports`.

The playground scripts `cd playground` first rather than using
`astro … --root playground`: with `--root`, `astro preview` can't find
Starlight's 404 route.

`WARN likec4.server.workspace No likec4 documents found in workspace` during a
build is expected — one per inline ` ```likec4 ` fence, from the throwaway
workspace `LikeC4.fromSource` compiles each snippet in.

`ASTROC4_NETWORK=1 bun run test` (or `bun run test:network`) is the only test
that touches the network; everything else is hermetic, so a red suite always
means a real defect.

## Skills

`skills/` holds agent skills that describe this package: `purview-astroc4-plugin`
(using it) and `purview-astroc4-grammar` (its highlighting derivation).

Neither covers LikeC4's own language. When writing the playground model in
`playground/src/likec4/`, the DSL examples in `docs/wiki/`, or fixture `.c4`
files, also install LikeC4's skill — `npx skills add https://likec4.dev/`, which
serves `likec4-dsl` over the Agent Skills Discovery protocol. FQNs, cross-file
scoping and the allowed top-level statements are its subject, and getting them
wrong surfaces here as a build failure with a parser message.

## Verifying changes

`bun run test && bun run check && bun run build`, then with `bun run preview`
running: `bun scripts/smoke.ts http://localhost:4321`. The static build passes
even when islands fail to hydrate — only the smoke test proves they draw nodes.
For highlighting, the smoke test's "distinct colours per block" check is the
proof that the grammar reached Expressive Code: the playground has no
Expressive Code config on purpose.

The plain-Astro path has its own two proofs: `bun run check` runs `astro check`
over `examples/astro` (where `App.Locals` has no `t`, so a Starlight-ism in the
components fails there first), and `bun run dev:astro` plus
`bun scripts/hydration.ts http://localhost:4322` shows the island drawing with
the fallback palette (`test:site` also asserts the example's `--likec4-accent`
override reaches the shell). `bun run test:site` covers both host sites from the tarball,
and runs the **full smoke suite** against the packed copy of the playground — the
same assertions the local loop uses, but on the installed package rather than
`dist/` next to the repo.

Hydration has its own dev-only failure mode: Vite served React's CommonJS
`react/compiler-runtime` raw, and every island threw "does not provide an export
named 'c'" while `astro build` stayed green. `src/integration.ts` adds it to
`vite.optimizeDeps.include`; `bun run test:site` (Chromium) and
`bun scripts/hydration.ts <url>` are what catch a regression, not the build.

For the model, `bun x likec4 export json playground/src/likec4 -o .tmp-model.json`
reports node/edge counts per view in ~2s; a view that lays out to 0 nodes
(e.g. a deployment view that only includes `node.**`) shows up there first.

## Conventions

- **`version` in `package.json` is the release's source of truth.** The release
  workflow triggers on a `package.json` change, publishes to npm under
  `prerelease` for `-prerelease.N` versions and `latest` otherwise, then tags.
  Nothing else is bumped at release time.
- **`src/grammar/likec4.tmLanguage.json` is generated.** It is the derivation of
  `src/grammar/like-c4.langium` (itself a snapshot of likec4/likec4), so edit
  `src/grammar/langium.ts` / `src/grammar/textmate.ts` and run
  `bun run grammar:sync`. `snapshot.test.ts` fails if the two disagree.
- **The grammar is fetched while the config loads.** `src/grammar/source.ts`
  runs from Starlight's `config:setup`, so `dev`, `build`, `check` and `sync`
  all fail on a bad ref. Do not wrap it in a try/catch that swallows errors;
  `onError` is the opt-out.
- **Starlight's plugin `config` is not the Astro config.** Use `astroConfig` for
  `root`, and `updateConfig({ expressiveCode })` to reach Expressive Code.
  `updateConfig` merges shallowly, so merge existing options yourself —
  `withLikeC4Language` does.
- **Integration-time output goes through Astro's logger**, never `console`: the
  logger honours the CLI log level and prefixes the message with the
  integration's name (`[@purview-dev/astroc4]` from the Starlight plugin, which
  is the label `Troubleshooting.md` quotes). `console` belongs to browser code
  (`render-icon.tsx`, `ErrorBoundary.tsx`) and to `scripts/`.
- **`keywords` is release metadata, not decoration.** Astro's integrations
  library indexes npm by keyword: `astro-integration` (and `withastro`) put the
  package in the library, and a category keyword (`ui`) decides where. The
  listing reads `name`, `description`, `repository` and `homepage`. See
  [Repository CI/CD](docs/wiki/contributing/Repository-CI-CD.md#astros-integrations-library).
- **The integration adds one thing to a site's config: `@astrojs/react`.** The
  islands need a React renderer, so `ensureReactRenderer` pushes it through
  `updateConfig({ integrations })` when it is missing (Astro runs hooks of
  integrations appended during `astro:config:setup`). MDX and Expressive Code are
  deliberately left alone — they change the host's content types and code blocks.
  Related: ordering between `astroc4()` and `astroExpressiveCode()` does not
  matter (Astro applies both mdast plugins and `markdown.rehypePlugins`);
  `examples/astro` lists Expressive Code first so that stays true.
- **No Tailwind, no host aliases.** Components are styled with plain CSS. A
  host's Tailwind doesn't scan this package, so utility classes would silently
  be unstyled.
- **`--likec4-*` tokens are read, never declared, by components.** Each reads
  them into a private `--_likec4-*` with the fallback chain
  (`var(--likec4-border, var(--sl-color-gray-5, rgba(…)))`), so a site's value on
  any ancestor inherits through instead of losing to the scoped selector.
  Every chain ends in a scheme-neutral value (an undefined `var()` with no
  fallback is invalid). `tokens.test.ts` enforces it; `.md` fence placeholders in
  `src/fences.ts` use the same chains inline. `--sl-color-white` is semantic
  (highest-contrast text), not literal white.
- **Project configs are read like LikeC4 reads them** (`src/projects.ts`): every
  name in LikeC4's `ConfigFilenames` (a `satisfies` check fails the type-check if
  LikeC4 changes the list), JSON names via JSON5, JS/TS via `bundle-require` with
  `likec4/config` stubbed, and `name` defaulting to the folder name.
- **Two entry points, one implementation.** `src/index.ts` is the Starlight
  plugin and `src/integration.ts` is the `AstroIntegration`; the plugin calls the
  integration. Anything both hosts need belongs in `integration.ts`, never in the
  plugin — and `Astro.locals.t` is read as `unknown` because `App.Locals` is
  empty outside Starlight. The plugin object also exposes the integration's
  `astro:config:setup`, because `astro add` writes `integrations: [astroc4()]`
  from the default export; the two hook sets are disjoint, so carrying both is
  safe (and it warns when a Starlight site ends up with the wrong one).
- **Strings go through `src/translations.ts`.** Astro components translate
  with `getTranslator(Astro.locals.t)` and pass islands plain strings
  (`IslandLabels`) — `t()` doesn't exist in the browser. Placeholders are
  `{name}`, filled by `format()`, never i18next's `{{name}}`.
- **The fence plugin is Sätteri mdast, not remark**, appended to the site's
  existing processor in `src/integration.ts` so Starlight's and other
  integrations' plugins survive.
- **Don't import `likec4` (the Node API) at module scope** in anything
  `src/index.ts` loads — see the comments in `src/fences.ts`.
- **In client code import `@likec4/core/model`, not `likec4/model`** — the
  latter pulls `createRequire` into the browser bundle.
- **`client:only` fallbacks need `slot="fallback"`**, or they're never painted.
- Imports the fence writes into pages use the package name
  (`@purview-dev/astroc4/components/…`), because they resolve from the site, not from here.
- **Everything is TypeScript, configs included (`astro.config.ts`); `dist/` is
  built, never committed.** Relative imports use `.ts` specifiers. `bun run
  build:lib` bundles the Node entry points with Bun (`.d.ts` from `tsc`, with
  `.ts` specifiers rewritten to `.js`) and
  copies the two grammar data files next to the bundle, where
  `import.meta.url` finds them. `exports` points the two entry points and the
  grammar JSON at `dist/`, and the components at `src/components/`: `.astro`
  and `.tsx` are compiled by the consuming site, which is also why
  `src/integration.ts` sets `ssr.noExternal`. There are no hand-written `.d.ts`
  files — the old ones shadowed the implementation's own types. Expressive Code
  only reads a config named `ec.config.mjs`, so `examples/astro` passes its
  options inline instead.
- **Comments only where required**: a non-obvious why (a workaround, a
  load-bearing order, a platform quirk). No file/path headers, no narration.
