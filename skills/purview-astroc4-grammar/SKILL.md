---
name: purview-astroc4-grammar
description: >-
  Use when working on astroc4's LikeC4 syntax highlighting or the committed grammar snapshot - the
  Langium to TextMate derivation, regenerating with grammar:sync, the snapshot parity test, choosing
  or pinning a grammar ref, the fetch and cache behaviour, and why the grammar is derived rather
  than hand-maintained.
license: MIT
metadata:
  product: astroc4
  repository: purview-dev/astroc4
---

# astroc4: the syntax-highlighting grammar

Shiki has no LikeC4 grammar. Astroc4 generates one from the language definition
in `likec4/likec4` at build time, so it cannot drift from the language.

## The rule that matters

**`src/grammar/likec4.tmLanguage.json` is generated.** Editing it by hand is
undone by the next `bun run grammar:sync`, and `snapshot.test.ts` fails on the
mismatch anyway. Change the derivation instead.

## Changing the grammar

1. Edit `src/grammar/langium.mjs` (what is extracted from the Langium text) or
   `src/grammar/textmate.mjs` (how it becomes TextMate JSON).
2. `bun run test` — the snapshot test now fails, which is the point.
3. `bun run grammar:sync` and commit both `like-c4.langium` and the JSON.

`bun run grammar:sync --ref v1.60.0` regenerates from a release instead of `main`;
the snapshot records the ref and a content hash.

Local checks: `bun run grammar:check` (snapshot parity),
`bun run test:network` (the live grammar — the only test that needs the network),
`bun run test` (everything else, hermetic).

## Two layers, kept apart

- **Generated**: every word list — blocks (`name='model' '{'`), keywords,
  `key=` property names, closed value domains (`ElementShape`, `ThemeColor`,
  `ArrowType`, `LineOptions`, sizes, ranks, routing, flow keywords), icon packs
  and booleans. These are what go stale when the language grows.
- **Structural**: how source is shaped — comments, quoted and triple-quoted
  strings, `#tag` versus `#hex`, `tech:astro`, `-[https]->`, declarations. A
  Langium rule says a token exists, not what it looks like.

Ordering inside `repository.keywords.patterns` is deliberate: blocks before
keywords (so `model {` wins), operator words before keywords (`is`, `not`),
variables before value domains (`source`/`target`), properties before values.

## At the site

`highlighting.ref` (default `main`) selects the branch, tag or commit;
`ASTROC4_REF` overrides it. Fetches are cached per `repo@ref` in
`node_modules/.cache/astroc4`, ETag-revalidated, replaced atomically. The
grammar is re-derived from the cached text on every run, so upgrading astroc4
never reuses a grammar from an older derivation.

Failure policy: a ref that cannot exist **always** fails; a network failure fails
unless `onError: 'warn'` (then: cached copy, then the bundled snapshot);
`offline: true` skips the network entirely. Never wrap the resolution in a
try/catch that swallows the error — the build is supposed to fail.

## Version sensitivity is tested, not assumed

`src/grammar/__fixtures__/mini.langium` and `mini.v2.langium` encode a real
upstream change: `ElementShape` gained `agent` after `v1.59.4`. Those fixtures
keep "the selected ref changes the output" verifiable without the network, and
`network.test.ts` re-checks the same claim against the live repository.
