# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-prerelease.4] - 2026-11-04

### Fixed

- **`1.0.0-prerelease.3` was published without `dist/`** and cannot be imported:
  `exports` points at the built files, and the release job published a fresh
  checkout without running `build:lib`. That version is deprecated; use
  `1.0.0-prerelease.4`.
- The release job now builds the package before publishing and fails if `dist/`
  is incomplete, and `prepublishOnly` runs `scripts/check-dist.ts`, which refuses
  to publish when any `exports` target is missing — whichever path invokes
  `npm publish`.

## [1.0.0-prerelease.3] - 2026-11-04

The package is TypeScript end to end. `src/` was JavaScript with JSDoc types plus
hand-written `.d.mts` declaration files; it is now `.ts`, and `dist/` is built
from it.

### Changed

- **Sources are TypeScript.** Every module in `src/` (the plugin, the fences, the
  grammar derivation, the translations) is annotated TypeScript. The two
  hand-written declaration files are gone: `tsc` generates them from the
  implementation, so a signature can no longer drift from the code.
- **`dist/` is the published layout.** `bun run build:lib` bundles the Node entry
  points with Bun, emits declarations from `tsc`, and copies the two grammar data
  files next to the bundle, where `import.meta.url` resolves them. `exports`
  points the entry points and the grammar JSON at `dist/`, and the components at
  `src/components/` — `.astro` and `.tsx` are compiled by the consuming site.
  `dev`, `build`, `check` and `test:site` run `build:lib` first.
- **The components ship as source, with `src/translations.ts` beside them.**
  `labels.ts` imports `../translations.js`; a relative import has to resolve
  inside the published tree, and keeping the strings as source (rather than a
  `dist/` subpath) keeps the components self-contained and lets `vitest` run
  without a build.
- **The playground imports `dist/index.js`**, the artifact a site installs,
  instead of resolving `src/index.mjs`. That is also the only way it works: a
  `.ts` plugin loaded by `astro.config.mjs` ends up inside Vite's module runner,
  whose dynamic `import()` of `@astrojs/markdown-satteri` fails with "module
  runner has been closed".
- The scripts in `scripts/` are TypeScript too, type-checked by `bun run check`
  through `tsconfig.scripts.json`, and run with `bun` (`test:smoke` used `node`).
- `test:site` now also asserts what the tarball carries: the built entry points,
  their declarations, both grammar data files and the components as source.

## [1.0.0-prerelease.2] - 2026-11-03

First version published by CI, over npm trusted publishing (OIDC): no token is
stored in the repository. `1.0.0-prerelease.1` was bootstrapped by hand because a
trusted publisher can only be configured once the package exists.

### Changed

- Releases after this one carry provenance attestations, now that the source
  repository is public.

## [1.0.0-prerelease.1] - 2026-11-03

First prerelease. The API is settled; what may still change before `1.0.0` is
the Phase 2 surface described in [Roadmap](docs/wiki/Roadmap.md).

### Added

- `<LikeC4View viewId="…" />` renders a view from the site's compiled `.c4`
  model as a hydrated React island.
- ` ```likec4 ` fences in `.mdx`: inline DSL compiled and laid out at build time,
  or an empty fence naming a view of the project model.
- LikeC4 syntax highlighting for Expressive Code, derived at build time from
  `packages/language-server/src/like-c4.langium` in likec4/likec4. The plugin
  injects the grammar into Starlight's Expressive Code options, so no
  `ec.config.mjs` is needed.
- Published as `@purview-dev/astroc4`: npm refuses the unscoped name as *"too
  similar to existing package astro"*, so the package is scoped and publishes
  with `--access public`.
- `highlighting.ref` (default `main`) selects the branch, tag or commit the
  grammar is read from, with `ASTROC4_REF` / `ASTROC4_OFFLINE` for CI.
- Grammar fetches are cached per `repo@ref` in
  `node_modules/.cache/astroc4`, ETag-revalidated, and written atomically.
- `bun run grammar:sync` / `grammar:check` regenerate and verify the committed
  grammar snapshot; `snapshot.test.ts` fails when the two disagree.
- Every UI string is translatable through Starlight's i18n, including the ones
  the browser interpolates.
- Test suite: unit tests for the Langium scanner, the generator, the fetch and
  cache policy, the plugin hooks and the fence transform; an opt-in live grammar
  check; a Playwright smoke test; and `test:site`, which packs the package and
  builds a real Starlight site from the tarball.
- CI: `pr.yml` (organisation gate, verify, smoke, packed consumer site) and
  `release.yml` (npm publish over **trusted publishing** with a prerelease
  dist-tag, then the shared purview-dev GitHub release).
- Wiki documentation under `docs/wiki`, published with `mkdocs.yml`.

### Notes

- The grammar is resolved while Astro loads its config, so `astro dev`,
  `astro build`, `astro check` and `astro sync` fail when a ref does not exist or
  the repository cannot be reached. `offline: true` or `onError: 'warn'` opt out;
  a ref that does not exist always fails.
- Starlight 0.42.8 is a hard floor: the plugin relies on the `astroConfig` hook
  argument and on `updateConfig({ expressiveCode })` being accepted.
- `1.0.0-prerelease.N` publishes to npm under the `prerelease` tag; while no
  stable release exists the workflow also keeps `latest` on the newest
  prerelease, because the registry refuses to delete `latest`. See
  [Repository CI/CD](docs/wiki/Repository-CI-CD.md#dist-tags).
