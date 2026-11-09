# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-prerelease.6] - 2026-11-09

### Added

- **Fences work in plain `.md`.** A ` ```likec4 ` fence in a `.md` page — which
  cannot hold a component — is compiled and laid out at build time like one in
  `.mdx`, written as a placeholder carrying the model, and mounted in the browser
  by a page script the integration injects. The script loads the diagram code
  only on a page that has a placeholder. Replaces the "fences only render as
  diagrams in .mdx files" warning; `FenceOptions.reporter` and `mdx` are
  deprecated and unused.
- **`imageAliases` just work.** A project's own `likec4.config.json` can declare
  `"@": "../../.assets/images"` and its model can say `icon @/azure/entra.svg`
  with no change for astroc4. Every icon LikeC4 compiles to a local file —
  through an alias or a path relative to the `.c4` file — is mapped to
  `/_astroc4/<project>/<path>` (`@brand/…` adds a `brand/` segment, `..` becomes
  `__up`), served from the original file in `astro dev`, copied into the build
  output, and rendered (SVGs inline, by LikeC4). Files under `public/` keep their
  public URL. No build-machine `file://` path reaches the client bundle any more,
  for any icon, and nothing is written into the site's source tree.
- **Named projects.** `projects: { architecture: '../../docs/architecture/likec4' }`
  compiles LikeC4 projects from anywhere — a sibling folder, another checkout, an
  absolute path — alongside the ones discovered under the site root. They are
  linked into `.astro/astroc4/workspace` (LikeC4 ignores anything under
  `node_modules`), and edits reload in `astro dev`.
- **`<LikeC4View project="…">`** names a configured or discovered project, and
  **`<LikeC4View file="diagrams/flow.c4">`** renders one `.c4` file from `src/`,
  compiled at build time. Fences take `project="…"` and `file="…"` (relative to
  the page) too.
- A missing icon, a missing or config-less project folder, two projects with the
  same name, and two icons served at the same URL each fail the build, naming
  the files involved.

### Changed

- **Breaking: no implicit "first project".** With more than one project,
  `<LikeC4View>` and empty fences need `project`; leaving it out, or naming an
  unknown project, now fails the build listing the names, instead of rendering
  whichever project was found first (or an error box in the browser).
  `projectId` still works as a deprecated alias of `project`. A site that sets
  `vitePlugin.workspace` or `languageServices` keeps the old in-browser
  resolution, and `projects` is ignored there with a warning.
- New translation key `likec4.error.projectRequired`.
- **A fence without `view="…"` shows the first view its source declares.** It
  showed LikeC4's automatic `index` landscape instead, which LikeC4 always lists
  first — so a snippet's own `view x of system { … }` never appeared.

### Known

- `bun run test` (Vitest under Bun) fails `plugin.test.ts › does not name a
  dependency the site cannot resolve` on Windows, as on `main` before this
  release: Bun's `createRequire` resolves `react` from outside the temporary
  site. The test passes under Node (`node node_modules/vitest/vitest.mjs run`).

## [1.0.0-prerelease.5] - 2026-11-05

### Added

- **The integration works in plain Astro, not only Starlight.** The diagrams were
  always built on Astro APIs; what was missing was an entry point and three
  Starlight assumptions. `@purview-dev/astroc4/integration` is now an
  `AstroIntegration` — the same `LikeC4VitePlugin`, fence transform, Windows
  preload and `react/compiler-runtime` fix the Starlight plugin installs, because
  both call the new `src/integration.ts`:

  ```js
  import astroc4 from '@purview-dev/astroc4/integration';
  export default defineConfig({ integrations: [astroc4(), expressiveCode(), mdx(), react()] });
  ```

  Order matters and is documented: `astroc4()` first (Expressive Code needs the
  Sätteri processor it installs), `expressiveCode()` before `mdx()`.
  - `Astro.locals.t` is read as `unknown`. `App.Locals` is an empty interface
    without Starlight's global augmentation, so `Astro.locals.t` is
    `TS2339: Property 't' does not exist` for a site that type-checks the
    components without Starlight — which `examples/astro` now does, and which is
    how the cast is kept honest. The runtime already fell back to English.
  - The components' colours moved to a `--likec4-*` layer that defaults to
    `--sl-color-*` and to scheme-neutral fallbacks, so a plain Astro page gets a
    legible frame instead of borders and backgrounds that resolve to nothing.
  - `examples/astro/` is a runnable plain-Astro site (`bun run dev:astro`, port
    4322) with a project view, an inline fence and `ec.config.mjs` highlighting;
    `docs/wiki/guide/Plain-Astro.md` documents what the site supplies and what it
    gives up (translations, the `highlighting` option).
  - **`astro add` now wires a working site.** The CLI reads only npm metadata —
    the `astro-integration` keyword and the package's default export — and writes
    `integrations: [astroc4()]`. The default export therefore carries the Astro
    protocol as well: Starlight calls only `config:setup`/`i18n:setup`, Astro
    calls only `astro:*`, so one object serves both and the CLI's wiring produces
    diagrams instead of a silently inert plugin. On a Starlight site that shape
    cannot run the plugin half, so it warns and names
    `starlight({ plugins: [astroc4()] })`. `@astrojs/starlight` is now an
    optional peer, since a plain Astro site never loads it.
  - **The integration supplies the React renderer itself.** The islands are
    `client:only="react"`, so a site without `@astrojs/react` built fine and then
    drew nothing (Astro's "no renderer" error names React, not this package).
    `astroc4()` now adds `@astrojs/react` when `integrations` does not already
    list it — Astro runs the hooks of integrations added during
    `astro:config:setup`, the mechanism Starlight uses for Expressive Code — and
    logs that it did. It adds nothing else on the site's behalf: `@astrojs/mdx`
    (a new content type) and `astro-expressive-code` (every code block on the
    site) stay the site's decision.
  - **The ordering rule was wrong, and is gone.** `astroc4()` and
    `astroExpressiveCode()` can be listed in either order: Astro applies a
    processor's mdast plugins *and* the site's `markdown.rehypePlugins`, which is
    how Expressive Code attaches itself when it runs before a processor exists.
    The example site now lists Expressive Code **first** and still builds with
    diagrams and `c4` highlighting, so the claim is asserted rather than
    asserted-in-prose. The only real rule is `astroExpressiveCode()` before
    `mdx()`, which Expressive Code enforces with its own error.
  - A fence in a `.md` page no longer says "rename it to `.mdx`" on a site
    without `@astrojs/mdx` — advice that cannot work. It says to add MDX first.
  - `test:site` now installs the tarball into **copies of both host sites** —
    `playground/` and `examples/astro/` — and runs `astro check`, `astro build`,
    the **full smoke suite** against the Starlight copy (on its preview server),
    a dev-server hydration check against the plain-Astro copy, and a rebuild of
    that copy with the exact config `astro add` writes. The smoke suite is the
    one that covers hydration, icons, highlighting colours, the loading
    placeholder and both locales, so those are now proven against the artifact a
    user installs rather than against `dist/` sitting beside the repository.

- **`bun scripts/hydration.ts <url>`** checks one diagram in a real browser: it
  waits for a LikeC4 element node, fails while the `.likec4-loading`
  placeholder is still visible, and fails on any console error. `test:site`
  runs it against the packed consumer site's own dev server, and the smoke test
  now asserts the placeholder is gone too.
- **The skills and the guide point at LikeC4's own DSL skill.** Astroc4 covers the
  integration — fences, components, highlighting — and not LikeC4's language, so
  both `skills/` files name `likec4.dev@likec4-dsl` as a companion and
  [Getting Started](docs/wiki/guide/Getting-Started.md#writing-the-model) explains
  when to reach for it. It installs from the project's site,
  `npx skills add https://likec4.dev/` (Agent Skills Discovery protocol), and the
  same page documents the MCP server for querying a model in natural language.

### Fixed

- **`<LikeC4View>` hydrates in `astro dev` again.** On a site configured the way
  the README says to configure one, every diagram stayed on "Loading
  architecture diagram…" while `astro build` exited 0, with one console line:

  ```
  [astro-island] Error hydrating …/LikeC4ProjectView.tsx
  SyntaxError: The requested module '/node_modules/react/compiler-runtime.js'
  does not provide an export named 'c'
  ```

  `likec4/react` is compiled with the React Compiler and imports `c` from React
  19's CommonJS `react/compiler-runtime`. The island's source is in this
  package, so dev served that file raw instead of pre-bundling it into an ES
  module; `astro build` bundled it correctly, which is why only a browser could
  see it. The plugin now adds `react/compiler-runtime` to
  `vite.optimizeDeps.include` — only entries the site does not already have,
  because Astro merges `vite` with Vite's `mergeConfig`, which concatenates
  arrays — so no site needs a workaround.

  It applies to **React 19.x** with **LikeC4 1.59.4 and later**, the versions
  whose `likec4/react` imports the compiler runtime; the production build was
  never affected. `test:site` now starts the packed consumer site's dev server
  and asserts in Chromium that the island draws nodes with no console errors;
  [Troubleshooting](docs/wiki/Troubleshooting.md#diagrams-stay-blank-while-the-build-passes)
  records the error and the manual `optimizeDeps.include` fix older releases
  need.

### Changed

- **The package follows Astro's integration conventions from end to end.**
  - `keywords` now carries `withastro` (the discoverability keyword Astro's
    community npm search filters on) and `ui` (the `CSS + UI` category), because
    the [integrations library](https://docs.astro.build/en/guides/integrations/#integrations-library)
    only files a package under a category when a category keyword is present —
    otherwise it is listed as "Uncategorized". `astro-integration`,
    `description`, `repository` and `homepage`, which the library reads, were
    already there.
  - The warning about a ` ```likec4 ` fence in a `.md` page now goes through
    Astro's logger (`logger.fork('likec4-fences').warn(…)`) instead of
    `console.warn`, so it respects the CLI log level and keeps the
    `[likec4-fences]` label the Troubleshooting page quotes. `likec4Fences()`
    takes an optional reporter; `console` remains the fallback for use outside
    an Astro config.
  - The README and Getting Started describe the two registrations, including the
    fact that `astro add` writes the plain-Astro shape and must be moved into
    `plugins` under Starlight.

  Hooks and config were already the documented shapes — `updateConfig` (never
  mutating `config`), `addIntegration` for the nested LikeC4 integration, a
  scoped unique integration `name`, `astro` among the `peerDependencies`,
  `"type": "module"`, and `exports` with `types` beside each entry point — so
  those are unchanged.
- **The wiki is hierarchical.** `docs/wiki/` is now a landing `README.md` plus
  `guide/` (using the plugin: getting started, fences, components, highlighting,
  icons, i18n, options), `contributing/` (the module map, the local workflow, CI
  and releases) and the two cross-cutting pages, `Troubleshooting.md` and
  `Roadmap.md`. Each folder has a `README.md` index, and every cross-page link
  was rewritten to match.
- Removed the static-site config and the tool-specific agent pointer: the pages
  are plain Markdown, so they read the same in the repository, on GitHub and in
  any editor, and nothing needs a generator to be navigable.
- Releases no longer wait for a deployment approval: the `npm` environment keeps
  its deployment record and its protected-branch restriction, but the required
  reviewer is gone, so merging a version bump publishes unattended. `main`'s
  branch protection (required checks, linear history) is the checkpoint, and the
  publish is idempotent — a re-run or a dispatch republishes nothing.

## [1.0.0-prerelease.4] - 2026-11-04

### Fixed

- **`1.0.0-prerelease.3` was published without `dist/`** and cannot be imported:
  `exports` points at the built files, and the release job published a fresh
  checkout without running `build:lib`. Use `1.0.0-prerelease.4`, which both
  `latest` and `prerelease` now resolve. `.3` still deserves
  `npm deprecate @purview-dev/astroc4@1.0.0-prerelease.3 "…"` (or the Deprecate
  button on its npm page): the trusted publisher can publish and move tags, but
  deprecation still needs a browser 2FA approval.
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
- Wiki documentation under `docs/wiki`.

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
  [Repository CI/CD](docs/wiki/contributing/Repository-CI-CD.md#dist-tags).
