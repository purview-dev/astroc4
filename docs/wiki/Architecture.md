# Architecture

For anyone changing the code. Two pipelines meet at the page: the model (LikeC4's
Vite plugin, plus the fence transform) and the highlighting (the grammar).

## Module map

```
src/                                  TypeScript sources — bundled into dist/ by build:lib
  index.ts                  the Starlight plugin: hooks, options, Expressive Code injection
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
    DiagramShell.astro      collapsible shell, plain CSS over Starlight tokens
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

## Tests

| Layer | Where |
| --- | --- |
| Pure helpers, scanner, generator, snapshot parity, fetch/cache policy, hook wiring | `src/**/__tests__` (Vitest, hermetic) |
| Live grammar | `network.test.ts`, opt-in with `ASTROC4_NETWORK=1` |
| Rendering, hydration, icons, i18n | `scripts/smoke.ts` (Playwright against the playground) |
| The shipped package | `scripts/test-site.ts` (packs the tarball, builds a consumer site) |
