# Architecture

For anyone changing the code. Two pipelines meet at the page: the model (LikeC4's
Vite plugin, plus the fence transform) and the highlighting (the grammar).

## Module map

```
src/                                  TypeScript sources — bundled into dist/ by build:lib
  index.ts                  the Starlight plugin: hooks, options, Expressive Code injection
  integration.ts            the AstroIntegration both entry points install
  fences.ts                 ```likec4 → component (.mdx) or placeholder (.md); lays out DSL
  projects.ts               discovered + named projects; reads every LikeC4 config file name
  workspace.ts              the staging workspace of links; `virtual:astroc4/projects`
  file-layout.ts            Vite plugin: `<LikeC4View file>` → layouted model at build time
  icon-plugin.ts            Vite plugin: `file://` icons → `/_astroc4/…`, served and copied
  icon-assets.ts            icon file → served URL, collision and missing-file checks
  expressive-code.ts        `likec4Language` (bundled) + `loadLikeC4Language(options)`
  translations.ts           the UI strings injected into Starlight's i18n
  types.d.ts                ambient types for `virtual:astroc4/projects`
  grammar/
    langium.ts              Langium text → vocabulary (blocks, keywords, domains, terminals)
    textmate.ts             vocabulary → TextMate JSON
    source.ts               ref validation, fetch, cache, resolve, failure policy
    like-c4.langium         committed snapshot of upstream's grammar
    likec4.tmLanguage.json  GENERATED from it — never edit
  components/                           shipped as source: the site compiles these
    LikeC4View.astro        author-facing wrapper for a project view
    LikeC4Fence.astro       target of the fence transform
    DiagramShell.astro      collapsible shell, plain CSS over the --likec4-* tokens
    DiagramFrame.astro      the sized container
    LoadingPlaceholder.astro  pre-hydration placeholder (carries the height)
    LikeC4ProjectView.tsx   island: loads a project through `likec4:model`'s `loadModel`
    LikeC4InlineView.tsx    island: renders a build-time model dump
    md-fences.tsx           browser module: mounts the islands into .md fence placeholders
    ErrorBoundary.tsx       translated error UI with retry
    labels.ts               server → island string plumbing, `format()`
    render-icon.tsx         icon rendering, `withImageIcons`
    icon-source.ts          icon id → source, refuses `file://`
    utils.ts                small shared helpers
```

Two entry points, one implementation:

| `exports` key | Module | Installed by |
| --- | --- | --- |
| `.` | `src/index.ts` | `starlight({ plugins: [astroc4()] })` |
| `./integration` | `src/integration.ts` | `integrations: [astroc4(), …]` |

`index.ts` calls `likec4Integration()` and adds what only Starlight has: the
`i18n:setup` injection, the `expressiveCode` option, and Starlight's plugin
context. Everything the diagrams need — the Vite plugins, project resolution, the
fence transform and its `.md` page script, the preload, the `optimizeDeps` fix,
the React renderer — lives in `integration.ts`, so the two hosts cannot drift.

The default export carries **both** hook sets: the Starlight plugin hooks and,
via spread, the integration's `astro:config:setup`. That is what makes
`astro add`'s automatic wiring work — the CLI reads the package's
`astro-integration` keyword and its default export, then writes
`integrations: [astroc4()]`, where only `astro:*` hooks ever run. Starlight never
calls `astro:*` hooks on a plugin and Astro never calls `config:setup`, so the
two protocols do not collide; `warnIfMiswired` covers the one bad case (a
Starlight site that got the CLI's shape, where the translations and highlighting
cannot run).

## Data flow

**A diagram renders in three steps.**

1. *Build, model.* `projects.ts` lists the discovered and named projects; with
   named ones, `workspace.ts` links them all into `.astro/astroc4/workspace`.
   `LikeC4VitePlugin` compiles that into the `likec4:model` / `likec4:icons` /
   `likec4:projects` virtual modules, `icon-plugin.ts` rewrites their local
   icon URLs, and `virtual:astroc4/projects` maps page names to LikeC4 ids.
   `<LikeC4View>` resolves its `project` there, on the server.
2. *Build, fences.* For a ` ```likec4 ` fence with DSL (or `file=`), `fences.ts`
   runs `LikeC4.fromSource(source)` and `layoutedModel()`, then hands the
   resulting `$data` JSON to `<LikeC4Fence>` as a prop (`.mdx`) or writes it into
   a placeholder's `data-model` (`.md`). `<LikeC4View file>` gets the same
   through `file-layout.ts`. This is why layout needs no browser.
3. *Browser.* `client:only="react"` islands — or, in `.md` pages, `md-fences.tsx`
   loaded by the injected page script — hydrate with `@likec4/core`, render
   through `likec4/react`, and rehydrate either a project model or the inline
   dump. Nothing is laid out client-side.

**Highlighting is resolved before any of that.**

`config:setup` (a Starlight plugin hook) runs *before* Starlight constructs its
Expressive Code integration, which is what makes the injection possible:
`updateConfig({ expressiveCode: { …existing, shiki: { langs: [registration] } } })`.

## Load-bearing details

| Detail | Why |
| --- | --- |
| `likec4` (the Node API) is never imported at module scope | It pulls Langium, chevrotain, an LSP and the WASM layout engine; doing it while `astro.config.ts` loads triggered a config-reload restart that killed the content-layer transport on a cold start. `fences.ts` loads it lazily. |
| `require('likec4')` rather than `import('likec4')` | Vite's SSR module runner intercepts dynamic `import()` and, on Windows, can already be tearing down when a page's fence needs the API, which crashed the build; `require()` goes through Node's resolver instead. It is used on every platform. |
| `preloadLikeC4()` on `command === 'build'` | Finishes that load before the race exists. Build-only, because eager-loading in dev is what caused the restart. |
| Fence imports use the package name (`@purview-dev/astroc4/components/…`) | They are written into the *site's* page, so they resolve from the site, not from this package. |
| The fence plugin is Sätteri mdast, appended to the site's processor | Astro 7 made Sätteri the default; `remarkPlugins` is a legacy option that is silently ignored without `@astrojs/markdown-satteri`. |
| `withLikeC4Language` merges, never replaces | Starlight's `updateConfig` merges shallowly, so replacing `expressiveCode` would delete a site's themes and plugins. |
| The grammar is plain JSON | Expressive Code JSON-round-trips integration options before the `<Code>` component renders them. |
| `ssr.noExternal: ['@purview-dev/astroc4']` | The components ship as `.astro`/`.tsx` source, so Vite has to transform them instead of handing them to Node. |
| `react/compiler-runtime` is added to `vite.optimizeDeps.include` | `likec4/react` is React-Compiler-built and imports `c` from React 19's CommonJS runtime. Unoptimized, dev serves it raw and every island dies with "does not provide an export named 'c'". `astro build` hides it by bundling correctly. Only missing entries are sent, because Astro merges `vite` with Vite's `mergeConfig`, which concatenates arrays. |
| `@astrojs/react` is added when the site has not | The islands are `client:only="react"`, and without a renderer a site builds and then draws nothing. Pushing it through `updateConfig({ integrations })` works because Astro's config loop reads integrations appended while it runs (`runHookConfigSetup`) — the same mechanism Starlight uses to add Expressive Code. Only that one: MDX and Expressive Code change the host's content types and code blocks, so they stay the site's decision. |
| Integration ordering is not ours to impose | `astroc4()` and `astroExpressiveCode()` work in either order, because Astro applies the processor's mdast plugins *and* `markdown.rehypePlugins` (Expressive Code's fallback when it runs before a processor exists). The example lists Expressive Code first so that stays true. Only Expressive-Code-before-MDX matters, and Expressive Code enforces it itself. |
| Integration-time warnings go through Astro's `logger`, never `console` | The logger honours the CLI log level and labels the message with the integration's name (`[@purview-dev/astroc4]` from the Starlight plugin, `[@purview-dev/astroc4/integration]` from the integration). `console` is only for browser code (`render-icon.tsx`, `ErrorBoundary.tsx`) and `scripts/`. |
| Fences in `.md` are placeholders plus one injected page script | A `.md` page cannot hold a component. The script runs on every page but only `import()`s `md-fences` when a `[data-astroc4-fence]` exists, and listens for `astro:page-load` for view transitions. |
| Named projects are linked, not copied, into `.astro/astroc4/workspace` | `LikeC4VitePlugin` compiles one folder. Links (junctions on Windows, which need no elevation) keep edits live; `.astro/` rather than `node_modules/` because LikeC4 ignores `**/node_modules/**`. `icon-assets.ts` `unstage()`s icon paths LikeC4 resolved lexically through the link. |
| Colours: public `--likec4-*` tokens, read but never declared | Each component reads them into private `--_likec4-*` properties with the fallbacks (`var(--likec4-border, var(--sl-color-gray-5, rgba(…)))`). Declaring the public names on the components' own elements would shadow a site's value from an ancestor, and the scoped selector would out-rank one on the same element. Every chain ends in a scheme-neutral value, because an undefined `var()` with no fallback is invalid at computed-value time. `tokens.test.ts` enforces it. |
| Config files are read the way LikeC4 reads them | All nine names in `ConfigFilenames` (`satisfies` fails the type-check if LikeC4 changes the list). JSON names via JSON5; JS/TS via `bundle-require` (esbuild), with `likec4/config` replaced by identity functions so an external project need not resolve it; `name` defaults to the folder name. Both loaders are `import()`ed lazily. |
| Relative imports use `.ts` | `allowImportingTsExtensions`; Bun and Vitest resolve them, and `scripts/build.ts` rewrites them to `.js` in the emitted `.d.ts` (which sit next to `.js` bundles) and fails if one survives. |
| `keywords` carries `astro-integration`, `withastro` and a category (`ui`) | Astro's [integrations library](https://docs.astro.build/en/guides/integrations/#integrations-library) indexes npm by those keywords and reads `name`, `description`, `repository` and `homepage` from `package.json`. Without a category keyword the listing lands under "Uncategorized". |

## Tests

| Layer | Where |
| --- | --- |
| Pure helpers, scanner, generator, snapshot parity, fetch/cache policy, hook wiring | `src/**/__tests__` (Vitest, hermetic) |
| Live grammar | `network.test.ts`, opt-in with `ASTROC4_NETWORK=1` |
| Rendering, hydration, icons, i18n | `scripts/smoke.ts` (Playwright against the playground) |
| One diagram hydrating, on either host | `scripts/hydration.ts` (Playwright; used by `test:site` against each consumer's dev server) |
| The shipped package | `scripts/test-site.ts` (packs the tarball, builds a copy of the playground and a copy of `examples/astro` from it, runs the full smoke suite against the playground copy's preview server and `hydration.ts` against the plain copy's dev server, asserts a site's `--likec4-accent` reaches the shell, then rebuilds the plain copy in the `astro add` shape) |
