# Syntax Highlighting

Shiki has no LikeC4 grammar. Astroc4 generates one at build time from the
language definition itself, and registers it with Expressive Code — the site does
not create an `ec.config.mjs`.

## The pipeline

```
likec4/likec4@<ref>/packages/language-server/src/like-c4.langium
        │  fetched once per repo@ref, cached, ETag-revalidated
        ▼
parseLangium()      blocks · keywords · property names · value domains · terminals
        ▼
buildTmLanguage()   TextMate JSON: generated word lists + a curated structural layer
        ▼
updateConfig({ expressiveCode: { …site options, shiki: { langs: [language] } } })
        ▼
Starlight → astro-expressive-code → Shiki → ```c4, ```likec4, <Code lang="likec4">
```

Two layers, deliberately separate:

- **Generated** — every word list: block keywords (`model {`), keywords,
  property names (`title`, `descriptionFile`), closed value domains
  (`ElementShape`, `ThemeColor`, `ArrowType`, `LineOptions`, sizes, ranks,
  routing, flow keywords), icon packs and booleans. These are exactly the lists
  that go stale when LikeC4 grows.
- **Structural** — how source is *shaped*: comments, quoted and triple-quoted
  strings, `#tag` versus `#hex`, `tech:astro` icons, `-[https]->` connectors,
  `element system` declarations, `view index`. A Langium rule says a token
  exists, not how it should look.

## Choosing a version

The default is `main`. Pin it for reproducible builds:

```js
astroc4({ highlighting: { ref: 'v1.60.0' } })
```

Or from CI, without touching the config file:

```sh
ASTROC4_REF=v1.60.0 bun run build
```

A ref is a branch, a tag (`v1.60.0`) or a full commit SHA. Anything that cannot
be a ref — `..`, spaces, a leading `-` — is rejected before a request is made.

Version selection is visible in the output, which is how the feature is tested:
`ElementShape` gained `agent` after `v1.59.4`, so a build pinned to `v1.59.4`
paints `agent` as a plain identifier while `main` paints it as a shape.

## Caching

| | |
| --- | --- |
| Location | `<site root>/node_modules/.cache/astroc4/grammar-<hash>.json` |
| Key | one file per `repo@ref`, so switching refs never thrashes |
| Contents | the raw Langium text, the `ETag`, and when it was fetched |
| Freshness | `cacheTtl` seconds (an hour by default), then a conditional request; a `304` reuses the body |
| Writes | written to a temp file and renamed, so two builds cannot corrupt one entry |

The TextMate grammar is **not** cached: it is re-derived from the cached Langium
text on every run (single-digit milliseconds), so upgrading astroc4 never serves
a grammar produced by an older derivation.

## When it fails

The grammar is resolved while Astro loads its configuration, so `astro dev`,
`astro build`, `astro check` and `astro sync` all go through it.

| Situation | Result |
| --- | --- |
| `ref` cannot be a ref | fails before any request |
| The ref does not exist, or the file moved | **always fails**, with the URL and the ref |
| Network unreachable or timed out | fails by default; `onError: 'warn'` falls back to the cached copy, then to the bundled snapshot |
| The file is no longer a Langium grammar | **always fails** — it is a defect, not a flake |
| `offline: true` / `ASTROC4_OFFLINE=1` | the bundled snapshot, no network |

`onError: 'silent'` behaves like `'warn'` without the log line.

## The bundled snapshot

`src/grammar/like-c4.langium` and `src/grammar/likec4.tmLanguage.json` ship with
the package so `offline: true` works out of the box. They are **generated**:

```sh
bun run grammar:sync              # from main
bun run grammar:sync --ref v1.60.0
bun run grammar:check             # fail if the snapshot is stale
```

`snapshot.test.ts` re-derives the JSON from the committed Langium text and
compares, so a change to the derivation that is not followed by a regeneration
fails `bun run test` — the gate a hand-maintained grammar cannot have.

## Scopes

The scopes are stable; themes decide how they look.

| Scope | Applies to |
| --- | --- |
| `keyword.control.block.likec4` | Keywords that open a block: `model {`, `views {`, `style {` |
| `keyword.control.likec4` | Other keywords, including block keywords used without a brace (`predicateGroup internals {`) |
| `keyword.operator.word.likec4` | `and`, `or`, `not`, `is` |
| `variable.language.likec4` | `source`, `target` |
| `support.type.property-name.likec4` | Property keys: `title`, `technology`, `link`, `descriptionFile`, `head`, `tail`, `kind`, `tag` |
| `constant.language.likec4` | Value domains: shapes, theme colours, arrow heads, line styles, sizes, ranks |
| `storage.type.likec4` | `element`, `tag`, `relationship`, `color` where they declare |
| `entity.name.type.likec4` | The name being declared, and the kind in `app = system` |
| `storage.type.view.likec4` / `entity.name.function.view.likec4` | `view` and the view's name |
| `storage.modifier.likec4` | `dynamic`, `deployment` in `dynamic view …` |
| `variable.other.definition.likec4` | The element name in `app = system` |
| `entity.name.tag.likec4` | `#tag` |
| `constant.other.color.rgb-value.hex.likec4` | `#0046BE` |
| `support.constant.icon-pack.likec4` / `support.constant.icon.likec4` | `tech:` and `astro` in `tech:astro` |
| `entity.name.type.relationship.likec4` | The kind in `-[https]->` |
| `keyword.operator.arrow.likec4` | `->`, `<->`, `]->`, `]<->` |
| `string.quoted.single/double/triple.likec4` | Quoted and markdown strings |
| `comment.block.likec4` / `comment.line.double-slash.likec4` | Comments |
| `markup.underline.link.likec4` | `https://…` |
| `constant.numeric.likec4`, `keyword.operator.wildcard.likec4` | Numbers and `*` / `.*` / `.**` |

## Sites that already have an `ec.config.mjs`

The plugin passes its language as Expressive Code **integration** options.
`astro-expressive-code` merges those with `ec.config.mjs` and **concatenates**
`shiki.langs`, so an existing config keeps its own languages and gains LikeC4.
The `<Code>` component sees the same merged options — the grammar is plain JSON,
which is what that path requires.

If you would rather pin the bundled grammar yourself:

```js
// ec.config.mjs
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineEcConfig({ shiki: { langs: [likec4Language] } });
```

`@purview-dev/astroc4/expressive-code` also exports `loadLikeC4Language(options)`, which runs
the same pipeline for a Markdown pipeline of your own.

## Verifying highlighting in a build

A static build passes even when an island fails to hydrate, so judge
highlighting by the HTML, not by the exit code:

```sh
grep -o 'data-language="c4"' dist/**/*.html | head
```

Expressive Code emits `<pre data-language="c4">` with per-token colour variables
(`--0:#…`). One colour means the grammar never reached Shiki; several means it
did. `scripts/smoke.mjs`, which CI runs, asserts at least four distinct colours
per block in a real browser.

