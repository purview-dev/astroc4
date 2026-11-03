# Local Development

```sh
bun install
bun run dev        # playground at http://localhost:4321
```

`playground/` is a small Starlight site (English and French) that consumes the
package through its own `exports`, so it behaves like an installed copy without a
pack step.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Playground dev server on port 4321. |
| `bun run build` | Static build of the playground. |
| `bun run preview` | Serve the built playground. |
| `bun run check` | `astro check` over `playground/` and `src/` (the tsconfig includes `../src`). |
| `bun run test` | Vitest: the scanner, the generator, the snapshot, the fetch policy, the plugin hooks, the fence transform. Hermetic. |
| `bun run test:watch` | The same, in watch mode. |
| `bun run test:network` | Adds the live check against `likec4/likec4`. The only test that needs the network. |
| `bun run test:site` | `npm pack`, then build a throwaway Starlight site from the tarball. Needs the registry. |
| `bun run test:smoke` | `scripts/smoke.mjs` against a running server (Playwright). |
| `bun run grammar:sync` | Regenerate `src/grammar/like-c4.langium` + `likec4.tmLanguage.json` from `main`. `--ref <tag>` for a release. |
| `bun run grammar:check` | Fail if the committed snapshot is stale. |
| `bun run likec4:validate` | `likec4 validate` over the playground model. |

The playground scripts `cd playground` first rather than passing
`--root playground`: with `--root`, `astro preview` cannot find Starlight's 404
route.

## Verifying a change

```sh
bun run test && bun run check && bun run build
bun run preview &
bun scripts/smoke.mjs http://localhost:4321
```

The static build passes even when islands fail to hydrate, so the smoke test is
not optional: it is the only thing that proves the diagrams draw, the icons
resolve, the fences became diagrams and the highlighting reached Expressive Code
(it asserts at least four colours per code block).

For anything that touches packaging — `exports`, `files`, a new `.d.mts`, a peer
dependency — also run `bun run test:site`. The playground resolves the package by
name from the repository itself, so it cannot see a broken tarball.

## Working on the grammar

1. Change `src/grammar/langium.mjs` or `src/grammar/textmate.mjs`.
2. `bun run test` — `snapshot.test.ts` will fail, because the committed JSON no
   longer matches its derivation.
3. `bun run grammar:sync` and commit both files.

`bun run grammar:sync --ref v1.60.0` regenerates from a release instead of
`main`; the snapshot records the ref and the content hash it was built from.

Two things to keep in mind while editing the derivation:

- the fixture pair `src/grammar/__fixtures__/mini*.langium` encodes the `agent`
  difference between `v1.59.4` and `main`, so it is what keeps version selection
  honest without the network;
- `src/grammar/__tests__/snapshot.test.ts` compares the JSON, so key order and
  sorting in the generator matter. Everything is sorted deliberately.

## Expected noise

- `WARN likec4.server.workspace No likec4 documents found in workspace` during a
  build — one per inline ` ```likec4 ` fence, from the throwaway workspace
  `LikeC4.fromSource` compiles each snippet in.
- `[WARN] [@astrojs/sitemap] The Sitemap integration requires the 'site'
  astro.config option` — the playground has no `site`.
- `bun run test:site` prints Astro's Pagefind/sitemap warnings from the
  throwaway site. They are the consumer site's, not a problem.
