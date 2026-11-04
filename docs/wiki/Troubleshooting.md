# Troubleshooting

Each entry is a failure that actually happens, and what it means.

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
2. Is the fence ` ```c4 ` or ` ```likec4 `? A ` ```likec4 ` fence in **`.mdx`**
   becomes a diagram, not code; use `c4` to show source, or ``<Code lang="likec4">``.
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

## A fence stayed a code block

The page is `.md`. Astro only supports components in `.mdx`, so the transform
leaves the fence alone and logs:

```
[likec4-fences] /path/page.md has a ```likec4 fence, but fences only render as diagrams in .mdx files.
```

Rename the page, or use `<LikeC4View>` from an `.astro` layout.

## `LikeC4View` shows "Unknown LikeC4 projectId"

The plugin compiles **every** `.c4` project under the site root, and the first one
found is the default. A vendored example model (a `node_modules` copy, a docs
sample) can silently become the default. Keep only the projects you mean to
render, or pass `projectId` explicitly, or point `vitePlugin.workspace` at one
directory.

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
[Syntax Highlighting](Syntax-Highlighting.md#scopes).

## `Cannot find module …/@purview-dev/astroc4/dist/index.js`

That version was published without its build output. `package.json` `exports`
points at `dist/`, which is built (and gitignored), so a publish from a checkout
that never ran `build:lib` produces a tarball with only `src/`. It happened once,
to `1.0.0-prerelease.3`.

Check what is installed before debugging anything else:

```sh
ls node_modules/@purview-dev/astroc4/dist/index.js
```

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
