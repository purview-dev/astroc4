# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `1.0.0-prerelease.N` publishes to npm under the `prerelease` tag, so a bare
  install keeps resolving a stable release once one exists. The one exception is
  the very first publish, which always also sets `latest`; see
  [Repository CI/CD](docs/wiki/Repository-CI-CD.md#dist-tags).
