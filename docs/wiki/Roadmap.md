# Roadmap

## Phase 1 — shipped in `1.0.0-prerelease.1`

- `<LikeC4View viewId="…" />` for views of the site's `.c4` model.
- ` ```likec4 ` fences: inline DSL compiled and laid out at build time, or an
  empty fence naming a view.
- ` ```c4 ` / `<Code lang="likec4">` highlighting, derived from the live Langium
  grammar at a ref you pick, with no `ec.config.mjs`.
- Grammar resolution that fails `dev`, `build`, `check` and `sync`.
- Translatable UI through Starlight's i18n.
- Icons: bundled packs, absolute URLs, files under `public/`.
- Test suite: hermetic unit tests, a live grammar check, a browser smoke test and
  a packed-consumer site build.

## Phase 2 — file hosting and selection

The next release makes a fence able to point at a model file rather than repeat
DSL or name a view of the one compiled project:

- ` ```likec4 file="./diagrams/checkout.c4" ` — a snippet on disk, compiled at
  build time, with the same failure behaviour as inline DSL.
- **Hosting**: a directory of diagrams the site can serve (download links,
  "view source"), so a reader can copy the model out of the page.
- **Selection**: choosing between several views of the same snippet from the
  fence meta, and a `view=` that can address a view in a *file* rather than in
  the compiled project.

Nothing in Phase 1 blocks this: fences already funnel through one meta parser
(`parseFenceMeta`), one transform (`src/fences.mjs`) and one component pair
(`LikeC4Fence.astro` / `LikeC4View.astro`), so a third target slots in beside
the existing two.

## Deliberately not planned

- **Client-side layout.** It would ship LikeC4's WASM graph engine to every
  reader and let an invalid model reach production.
- **A second, hand-maintained TextMate grammar.** The derivation is the reason
  highlighting tracks the language; a curated copy would drift again, which is
  exactly the problem this package exists to remove.
- **Tailwind or host aliases in the components.** A host's Tailwind does not scan
  this package, so utility classes would silently be unstyled.
