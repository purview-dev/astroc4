# Architecture

For anyone changing the code. Two pipelines meet at the page: the model (LikeC4's
Vite plugin, plus the fence transform) and the highlighting (the grammar).

## Module map

```
src/                                  TypeScript sources — bundled into dist/ by build:lib
  index.ts                  the Starlight plugin: hooks, options, Expressive Code injection
  integration.ts            the AstroIntegration both entry points install
  fences.ts                 ```likec4 → component; compiles and lays out inline DSL
  expressive-code.ts        `likec4Language` (bundled) + `loadLikeC4Language(options)`
  translations.ts           the UI strings injected into Starlight's i18n
  types.d.ts                ambient types for `likec4:*` virtual modules and `t()`
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
    LikeC4ProjectView.tsx   island: loads a project from `likec4:react/<id>`
    LikeC4InlineView.tsx    island: renders a build-time model dump
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
context. Everything the diagrams need — the Vite plugin, the fence transform,
the preload, the `optimizeDeps` fix — lives in `integration.ts`, so the two hosts
cannot drift.

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

1. *Build, model.* `LikeC4VitePlugin` compiles every `.c4` project into the
   `likec4:model` / `likec4:icons` / `likec4:projects` virtual modules.
   `<LikeC4View>` picks a project there.
2. *Build, fences.* For a ` ```likec4 ` fence with DSL, `fences.ts` runs
   `LikeC4.fromSource(source)` and `layoutedModel()`, then hands the resulting
   `$data` JSON to `<LikeC4Fence>` as a prop. This is why layout needs no browser.
3. *Browser.* `client:only="react"` islands hydrate with `@likec4/core`, render
   through `likec4/react`, and rehydrate either a project model or the inline
   dump. Nothing is laid out client-side.

**Highlighting is resolved before any of that.**

`config:setup` (a Starlight plugin hook) runs *before* Starlight constructs its
Expressive Code integration, which is what makes the injection possible:
`updateConfig({ expressiveCode: { …existing, shiki: { langs: [registration] } } })`.

## Load-bearing details

| Detail | Why |
| --- | --- |
| `likec4` (the Node API) is never imported at module scope | It pulls Langium, chevrotain, an LSP and the WASM layout engine; doing it while `astro.config.mjs` loads triggered a config-reload restart that killed the content-layer transport on a cold start. `fences.ts` loads it lazily. |
| On Windows, `require('likec4')` rather than `import('likec4')` | Vite's SSR module runner can already be tearing down when a page's fence needs the API, which crashed the build; `require()` goes through Node's resolver instead. |
| `preloadLikeC4()` on `command === 'build'` | Finishes that load before the race exists. Build-only, because eager-loading in dev is what caused the restart. |
| Fence imports use the package name (`@purview-dev/astroc4/components/…`) | They are written into the *site's* page, so they resolve from the site, not from this package. |
| The fence plugin is Sätteri mdast, appended to the site's processor | Astro 7 made Sätteri the default; `remarkPlugins` is a legacy option that is silently ignored without `@astrojs/markdown-satteri`. |
| `withLikeC4Language` merges, never replaces | Starlight's `updateConfig` merges shallowly, so replacing `expressiveCode` would delete a site's themes and plugins. |
| The grammar is plain JSON | Expressive Code JSON-round-trips integration options before the `<Code>` component renders them. |
| `ssr.noExternal: ['@purview-dev/astroc4']` | The components ship as `.astro`/`.tsx` source, so Vite has to transform them instead of handing them to Node. |
| `react/compiler-runtime` is added to `vite.optimizeDeps.include` | `likec4/react` is React-Compiler-built and imports `c` from React 19's CommonJS runtime. Unoptimized, dev serves it raw and every island dies with "does not provide an export named 'c'". `astro build` hides it by bundling correctly. Only missing entries are sent, because Astro merges `vite` with Vite's `mergeConfig`, which concatenates arrays. |
| `@astrojs/react` is added when the site has not | The islands are `client:only="react"`, and without a renderer a site builds and then draws nothing. Pushing it through `updateConfig({ integrations })` works because Astro's config loop reads integrations appended while it runs (`runHookConfigSetup`) — the same mechanism Starlight uses to add Expressive Code. Only that one: MDX and Expressive Code change the host's content types and code blocks, so they stay the site's decision. |
| Integration ordering is not ours to impose | `astroc4()` and `astroExpressiveCode()` work in either order, because Astro applies the processor's mdast plugins *and* `markdown.rehypePlugins` (Expressive Code's fallback when it runs before a processor exists). The example lists Expressive Code first so that stays true. Only Expressive-Code-before-MDX matters, and Expressive Code enforces it itself. |
| Integration-time warnings go through Astro's `logger`, never `console` | The logger honours the CLI log level and labels the message with the integration's name; `logger.fork('likec4-fences')` keeps the `[likec4-fences]` label the Troubleshooting page quotes. `console` is only for browser code (`render-icon.tsx`, `ErrorBoundary.tsx`) and `scripts/`. |
| Colours are a `--likec4-*` layer over `--sl-color-*` | Starlight defines the tokens; plain Astro does not, and an undefined `var()` with no fallback is invalid at computed-value time. Each component declares the tokens it uses with a scheme-neutral fallback (`rgba(128,128,128,…)`, `inherit`), which is why the same components frame a diagram on either host. |
| `keywords` carries `astro-integration`, `withastro` and a category (`ui`) | Astro's [integrations library](https://docs.astro.build/en/guides/integrations/#integrations-library) indexes npm by those keywords and reads `name`, `description`, `repository` and `homepage` from `package.json`. Without a category keyword the listing lands under "Uncategorized". |

## Tests

| Layer | Where |
| --- | --- |
| Pure helpers, scanner, generator, snapshot parity, fetch/cache policy, hook wiring | `src/**/__tests__` (Vitest, hermetic) |
| Live grammar | `network.test.ts`, opt-in with `ASTROC4_NETWORK=1` |
| Rendering, hydration, icons, i18n | `scripts/smoke.ts` (Playwright against the playground) |
| One diagram hydrating, on either host | `scripts/hydration.ts` (Playwright; used by `test:site` against each consumer's dev server) |
| The shipped package | `scripts/test-site.ts` (packs the tarball, builds a Starlight site and a plain-Astro site — the latter copied from `examples/astro` — then checks hydration on both dev servers) |
