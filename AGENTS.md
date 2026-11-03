## Development

Bun project. The package source is `src/`; `playground/` is a small Starlight
site that consumes it, for developing without a host site. The wiki in
`docs/wiki/` is the published documentation — keep it in step with the code.

```
bun run dev            # playground dev server, http://localhost:4321
bun run build          # playground static build
bun run test           # vitest: pure helpers, the Langium scanner, the grammar
bun run test:network   # + a live check against likec4/likec4
bun run test:site      # pack the tarball and build a consumer Starlight site
bun run check          # astro check (playground and src/)
bun run grammar:check  # the committed grammar snapshot matches its derivation
```

The playground scripts `cd playground` first rather than using
`astro … --root playground`: with `--root`, `astro preview` can't find
Starlight's 404 route.

`WARN likec4.server.workspace No likec4 documents found in workspace` during a
build is expected — one per inline ` ```likec4 ` fence, from the throwaway
workspace `LikeC4.fromSource` compiles each snippet in.

`ASTROC4_NETWORK=1 bun run test` (or `bun run test:network`) is the only test
that touches the network; everything else is hermetic, so a red suite always
means a real defect.

## Verifying changes

`bun run test && bun run check && bun run build`, then with `bun run preview`
running: `bun scripts/smoke.mjs http://localhost:4321`. The static build passes
even when islands fail to hydrate — only the smoke test proves they draw nodes.
For highlighting, the smoke test's "distinct colours per block" check is the
proof that the grammar reached Expressive Code: the playground has no
`ec.config.mjs` on purpose.

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
  `src/grammar/langium.mjs` / `src/grammar/textmate.mjs` and run
  `bun run grammar:sync`. `snapshot.test.ts` fails if the two disagree.
- **The grammar is fetched while the config loads.** `src/grammar/source.mjs`
  runs from Starlight's `config:setup`, so `dev`, `build`, `check` and `sync`
  all fail on a bad ref. Do not wrap it in a try/catch that swallows errors;
  `onError` is the opt-out.
- **Starlight's plugin `config` is not the Astro config.** Use `astroConfig` for
  `root`, and `updateConfig({ expressiveCode })` to reach Expressive Code.
  `updateConfig` merges shallowly, so merge existing options yourself —
  `withLikeC4Language` does.
- **No Tailwind, no host aliases.** Components are styled with plain CSS over
  Starlight's `--sl-color-*` tokens. A host's Tailwind doesn't scan this
  package, so utility classes would silently be unstyled. `--sl-color-white`
  is semantic (highest-contrast text), not literal white.
- **Strings go through `src/translations.mjs`.** Astro components translate
  with `getTranslator(Astro.locals.t)` and pass islands plain strings
  (`IslandLabels`) — `t()` doesn't exist in the browser. Placeholders are
  `{name}`, filled by `format()`, never i18next's `{{name}}`.
- **The fence plugin is Sätteri mdast, not remark**, appended to the site's
  existing processor in `src/index.mjs` so Starlight's and other
  integrations' plugins survive.
- **Don't import `likec4` (the Node API) at module scope** in anything
  `src/index.mjs` loads — see the comments in `src/fences.mjs`.
- **In client code import `@likec4/core/model`, not `likec4/model`** — the
  latter pulls `createRequire` into the browser bundle.
- **`client:only` fallbacks need `slot="fallback"`**, or they're never painted.
- Imports the fence writes into pages use the package name
  (`@purview-dev/astroc4/components/…`), because they resolve from the site, not from here.
- Node-side entry points are `.mjs` with a sibling `.d.mts`: TypeScript doesn't
  read JSDoc from a package in `node_modules`. A `.d.mts` shadows JSDoc for the
  tests too, so keep the two in step.
