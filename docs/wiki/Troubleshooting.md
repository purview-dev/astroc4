# Troubleshooting

Each entry is a failure that actually happens, and what it means.

## Diagrams stay blank while the build passes

The frame renders, the page answers 200, `astro build` exits 0 — and every
diagram still shows "Loading architecture diagram…". In the browser console:

```
[astro-island] Error hydrating @purview-dev/astroc4/src/components/LikeC4ProjectView.tsx
SyntaxError: The requested module 'react/compiler-runtime.js?v=…'
does not provide an export named 'c'
```

`likec4/react` (LikeC4 1.59.4 and later) is compiled with the React Compiler,
so it imports `c` from `react/compiler-runtime`. React 19 ships that entry point
as CommonJS:

```js
// react/compiler-runtime.js
module.exports = require('./cjs/react-compiler-runtime.development.js'); // exports.c = …
```

The island is `client:only="react"` and its source is in this package, so in
`astro dev` Vite can hand the browser the `compiler-runtime.js` entry point
as-is instead of pre-bundling it into an ES module with a named `c` export. The
island then throws during hydration and stays on its
`slot="fallback"` placeholder. **`astro build` bundles the dependency
correctly**, which is why this is invisible to a build, to `astro check` and to
`likec4 validate` — a green build is not proof that a diagram renders.

### Fixed versions

The plugin now adds `react/compiler-runtime` to the site's
`vite.optimizeDeps.include` (merged with whatever the site sets — only missing
entries are added, because Astro's `updateConfig` concatenates Vite arrays).
That is everything a site needs: no manual Vite configuration. It matters for
**React 19.x** (any version whose `react/compiler-runtime` is CommonJS) together
with **LikeC4 1.59.4 and later**; older LikeC4 builds do not import the compiler
runtime at all.

On a release before the fix, or to check the diagnosis by hand, add the entry
yourself:

```js
// astro.config.mjs
export default defineConfig({
  vite: {
    optimizeDeps: { include: ['react/compiler-runtime'] },
  },
  integrations: [starlight({ plugins: [astroc4()] }), react()],
});
```

Then delete the `.vite` cache inside `node_modules` (and any `.vite` cache under
the site root) and restart `astro dev`; the cache is why the failure can appear
to come and go.

Do not treat the other workarounds people reach for as fixes: `client:only` is
already correct, pinning an older React or LikeC4 only hides the bug, and
`onError: 'warn'` is the grammar-fetch option — it has nothing to do with
hydration.

### Proving it before and after

Only a browser on a dev server shows this. Either one does it:

```sh
bun scripts/hydration.ts http://localhost:4321        # a running site
bun run test:site                                     # the packed consumer site
```

`hydration.ts` waits for a `[data-likec4-node], .react-flow__node` element
(LikeC4 renders into a shadow root, which Playwright locators pierce), fails if
the `.likec4-loading` placeholder is still visible, and fails on any console
error. `bun run test:site` runs exactly that against a throwaway Starlight site
built from the tarball, on that site's own dev server, which is the regression
test for this bug.

## The build fails and the log mentions the grammar

```
could not fetch the LikeC4 grammar from https://raw.githubusercontent.com/…
```

The plugin resolves the grammar while Astro loads its config, so a machine
without access to `raw.githubusercontent.com` fails the build. Choose one:

```js
astroc4({ highlighting: { offline: true } })      // bundled snapshot, no network
astroc4({ highlighting: { onError: 'warn' } })    // last cached copy, then bundled
```

```sh
ASTROC4_OFFLINE=1 bun run build
```

A ref that does not exist is different: it fails even with `onError: 'warn'`,
because it will fail the same way on every build. Check the tag (`v1.60.0`, not
`1.60.0`).

## Diagrams render but nothing is coloured

1. Is `expressiveCode: false` in the Starlight config? The plugin logs a warning
   and skips highlighting, because there are no code blocks to highlight.
2. Is the fence ` ```c4 ` or ` ```likec4 `? A ` ```likec4 ` fence (in `.md` or
   `.mdx`) becomes a diagram, not code; use `c4` to show source, or ``<Code lang="likec4">``.
3. Look at the HTML, not the exit code: `<pre data-language="c4">` should contain
   several `--0:#…` colour variables. One colour means the grammar never reached
   Shiki.
4. Is the site on a Starlight older than 0.42.8? The floor is load-bearing — the
   plugin needs the `astroConfig` hook argument and an `updateConfig` key that
   earlier versions do not accept.

## `expressiveCode: false` warning, but I want highlighting

You cannot have both: with Expressive Code disabled Starlight renders code with
Astro's own `<Code>`, which reads `markdown.shikiConfig`, not the Expressive Code
options this plugin sets.

## A fence in a `.md` page shows "Loading diagram…" forever

Since `1.0.0-prerelease.6` a fence in a `.md` page is a placeholder that a script
astroc4 injects into every page mounts in the browser (a `.md` page cannot hold a
component). If it never mounts:

1. Check the browser console for a failed `import()` of
   `@purview-dev/astroc4/components/md-fences`.
2. Check the integration ran: the page's HTML has a `data-astroc4-fence` element
   and a page script containing `[data-astroc4-fence]`.
3. A page rendered outside Astro's pipeline (raw HTML, a custom renderer) does not
   get the injected script.

## Build fails: `Several LikeC4 projects exist (…); pass project="…"`

The site has more than one LikeC4 project — discovered under the site root or
named in `projects` — and a `<LikeC4View>` or empty fence names none. Since
`1.0.0-prerelease.6` there is no "first project found" default, so a vendored
model can no longer silently replace yours. Add `project="<name>"`; the message
lists the names. An unknown name fails the same way.

## `LikeC4View` shows "Unknown LikeC4 projectId"

Only on a site that sets `vitePlugin.workspace` (or `languageServices`) itself:
astroc4 then does not know the projects at build time, and the browser island
reports the unknown name. Pass a `project` that workspace contains.

## `Invalid … Could not resolve reference to ElementKind named 'person'`

LikeC4 requires every element kind to be declared before use:

```
specification {
  element person
}
model {
  reader = person 'Reader'
}
```

This is a model error, not a plugin error — the plugin just lets it fail the
build, which is the point.

## The build crashed on Windows with "Vite module runner has been closed"

That is the race `preloadLikeC4()` and the `require()`-instead-of-`import()`
comment in `src/fences.mjs` exist to prevent. If it comes back, the preload is no
longer running before the first page render (look at `command === 'build'` in
`src/index.mjs`).

## Highlighting changed without a code change

The default ref is `main`, which moves. Pin a tag or a SHA, or set `ASTROC4_REF`
in CI. The build log always names what it used:

```
[astroc4] LikeC4 grammar likec4/likec4@main (da5af77245f9) — highlighting ```c4 and ```likec4 fences
```

`from cache` / `from bundled` in that line tells you which path was taken.

## My theme does not colour LikeC4 source

The scopes are TextMate-standard but LikeC4-specific (`keyword.control.likec4`,
`constant.language.likec4`, …). A theme without rules for them falls back to
nearest-parent colours, which can look flat. Add rules for the scopes listed in
[Syntax Highlighting](guide/Syntax-Highlighting.md#scopes).

## `Cannot find module …/@purview-dev/astroc4/dist/index.js`

That version was published without its build output. `package.json` `exports`
points at `dist/`, which is built (and gitignored), so a publish from a checkout
that never ran `build:lib` produces a tarball with only `src/`. It happened once,
to `1.0.0-prerelease.3`.

Check what is installed before debugging anything else:

```sh
bun -e "console.log(require.resolve('@purview-dev/astroc4'))"
```

That prints the file the package resolves to, and fails when the published
tarball shipped `src/` only.

If it is missing, move to a version that has it (`1.0.0-prerelease.4` or later,
`1.0.0-prerelease.2` for the older source-only layout). Publishes are now gated:
the release job builds first, and `prepublishOnly` runs `scripts/check-dist.ts`,
which refuses to publish when any `exports` target is missing.

## `bun run test:site` fails but everything else passes

It packs the package and builds a consumer site in a temp directory, so it fails
for reasons the playground cannot see: `files` missing something, an `exports`
subpath pointing at a file that is not published, a peer dependency not declared,
a declaration that does not resolve against the consumer's `node_modules`, or a
`dist/` file the build forgets to copy. Re-run with `--keep` to inspect the site
it built.
