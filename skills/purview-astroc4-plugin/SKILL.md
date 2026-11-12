---
name: purview-astroc4-plugin
description: >-
  Use when adding or changing LikeC4 diagrams in an Astro or Starlight site with astroc4 - wiring the
  Starlight plugin or the plain-Astro integration, choosing between a ```likec4 fence and
  <LikeC4View>, naming projects (discovered, named via `projects`, or a single file), understanding
  why highlighting needs no Expressive Code config under Starlight, diagnosing a diagram that renders but is
  uncoloured, stays on "Loading…", or a fence that stayed a code block. Covers the integration, not
  the DSL: pair it with the official LikeC4 DSL skill when the model itself is being written.
license: MIT
metadata:
  product: astroc4
  repository: purview-dev/astroc4
  companion-skills: likec4.dev@likec4-dsl
---

# astroc4: LikeC4 diagrams in an Astro or Starlight site

Astroc4 has two entry points over one implementation. Under Starlight, one
plugin call wires LikeC4's Vite plugin, the fence transform, syntax highlighting
and the UI strings. Without Starlight, an `AstroIntegration` does everything but
the highlighting injection and the translations.

## Wiring

```ts
// astro.config.ts — Starlight
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import astroc4 from '@purview-dev/astroc4';

export default defineConfig({
	integrations: [starlight({ plugins: [astroc4()] })],
});
```

```ts
// astro.config.ts — plain Astro
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import astroc4 from '@purview-dev/astroc4/integration';
import { likec4Language } from '@purview-dev/astroc4/expressive-code';

export default defineConfig({
	integrations: [expressiveCode({ shiki: { langs: [likec4Language] } }), astroc4(), mdx()],
});
```

- The diagrams are React islands; astroc4 adds `@astrojs/react` when the site
  has not. Listing `react()` yourself is fine; it is not added twice.
- Plain Astro only: `@astrojs/mdx` is needed for `<LikeC4View>` and for fences in
  `.mdx` (not for fences in `.md`). Highlighting needs `astro-expressive-code`
  given `likec4Language` from `@purview-dev/astroc4/expressive-code`, inline as
  above (Expressive Code's own config file must be named `ec.config.mjs`).
  Expressive Code must come before MDX.
- `astro add @purview-dev/astroc4` writes `integrations: [astroc4()]`. That
  works on plain Astro, but on Starlight it has to move into `plugins`: in
  `integrations` it gets diagrams only, with no translations or highlighting,
  and the plugin warns.

## Projects

Every folder under the site root with a LikeC4 config file is a project. All of
LikeC4's names work: `.likec4rc`, `.likec4.config.json`, `likec4.config.json`
(JSON5) and `likec4.config.{ts,mts,cts,js,mjs,cjs}` (bundled with esbuild;
`likec4/config` imports are stubbed). The project is named by the config's
`name`, or after its folder when there is none, as LikeC4 does. Models elsewhere
are added by name:

```js
astroc4({ projects: { architecture: '../../docs/architecture/likec4' } })
```

With one project, pages need not name it. With several, every `<LikeC4View>` and
empty fence (in `.md` or `.mdx`) needs `project="<name>"`, or the build fails
and lists the names. An unknown name fails the build too.
Setting `vitePlugin.workspace` hands discovery to LikeC4, and `projects` is then
ignored.

## Choosing a form

| Need | Use |
| --- | --- |
| A diagram whose DSL belongs next to the prose | ` ```likec4 ` fence with inline DSL, in `.md` or `.mdx` |
| A view of a project's model | ` ```likec4 view="id" ` (empty fence) or `<LikeC4View viewId="id" />` |
| One `.c4` file, compiled on its own | ` ```likec4 file="./x.c4" ` (relative to the page) or `<LikeC4View file="x.c4">` (relative to `src/`) |
| Show LikeC4 *source* rather than a diagram | ` ```c4 ` fence, or `<Code lang="likec4">` |

Inline DSL and `file=` are compiled and laid out at build time, so a typo fails
the build with the file name and the parser's message. Without `view=`, a fence
shows the first `view` its source declares.

A tutorial or example page that intentionally shows partial DSL can relax this:
`astroc4({ validation: 'relaxed' })` logs a warning and leaves an undrawable
fence as a highlighted code block instead of failing. Scope it with
`{ default: 'strict', collections: ['tutorials'], relaxed: ['docs/examples/**'] }`
— collections are named, pages are globbed.

In `.mdx` a fence becomes a component. In `.md` it becomes a placeholder that an
injected page script mounts. It takes the same options (`title` defaults to
"Diagram", `collapsible`, `defaultOpen`), but has no hint or badge and its
strings are English.

## Styling

Colours are public tokens a site sets on any ancestor, e.g.
`:root { --likec4-accent: #0046be; }`. Available: `--likec4-border`, `-surface`,
`-surface-alt`, `-text`, `-text-muted`, `-accent`, `-skeleton`, `-danger`,
`-danger-soft`, `-danger-text`. Unset, they fall back to Starlight's
`--sl-color-*`, then to neutral greys. Components only read them (never declare
them), so overrides inherit; keep it that way when editing a component.

## Highlighting

Under Starlight the plugin resolves the Langium grammar from likec4/likec4 and
injects it into Starlight's Expressive Code options from its `config:setup`
hook. Consequences:

- do **not** add an `ec.config.mjs` for LikeC4 on Starlight; if one already
  exists it keeps working (Expressive Code concatenates `shiki.langs`);
- if the site sets `expressiveCode: false` there are no code blocks to colour,
  and the plugin says so with a warning;
- Starlight 0.42.8 is a hard floor: the hook argument and the `updateConfig`
  key it relies on do not exist earlier;
- pin with `highlighting: { ref: 'v1.60.0' }` or `ASTROC4_REF`. A grammar fetch
  failure fails the build unless `offline: true` or `onError: 'warn'`.

The grammar derivation itself is the `purview-astroc4-grammar` skill's subject.

## Writing the model: add the LikeC4 DSL skill

This skill ends at the fence. What goes *inside* it is LikeC4's language, and the
rules that bite are not visible from here. FQNs must be unique per project.
Scoping does not cross file boundaries. A project is the directory of the
nearest config file. Markdown
properties need triple quotes.

LikeC4 publishes a skill that covers exactly that (`likec4-dsl`, the complete DSL
reference: specification, model, views, deployment, predicates, CLI). Install it
from the project's own site:

```sh
npx skills add https://likec4.dev/
```

That endpoint uses the Agent Skills Discovery protocol, so it works with Claude
Code, Cursor, Windsurf and any other agent that speaks it. If the discovery
endpoint is unreachable, the same skill also sits in `skills/likec4-dsl/` of the
`likec4/likec4` repository.

Pair them when a task writes a model rather than wires a page: authoring a `.c4`
project, writing inline DSL in a fence, or fixing a
`Could not resolve reference to …` error. Keep this skill for the integration
questions: which form to use, which project a page gets, why nothing is
coloured, why a diagram did not draw.

## Diagnosing

| Symptom | Check |
| --- | --- |
| No colours anywhere | `expressiveCode: false`? astroc4 in `integrations` instead of `plugins`? plain Astro without `likec4Language` passed to `expressiveCode()`? which fence language? does `<pre data-language="c4">` contain several `--0:#…` values? |
| Diagrams blank but the build passes | a static build passes even when islands fail to hydrate; use the browser smoke test (`bun scripts/hydration.ts <url>` on a **dev** server), not the exit code |
| A ` ```likec4 ` fence stayed a code block | `fences: false`; the site's Markdown processor is not Sätteri; or the fence could not be drawn and `validation: 'relaxed'` left it as code. The last two log a warning |
| `.md` fence stuck on "Loading diagram…" | browser console: did the `import()` of `@purview-dev/astroc4/components/md-fences` fail? is there a `data-astroc4-fence` element and the injected page script? |
| Build fails `…likec4.config… could not be read` | the JSON5 parse or esbuild error follows the path; a JS/TS config's imports (other than `likec4/config`) must resolve from its folder |
| Build fails "Several LikeC4 projects exist" | more than one project (discovered or named in `projects`); pass `project="<name>"` |
| Icons from `imageAliases` missing | they work unchanged since `1.0.0-prerelease.6`, served under `/_astroc4/<project>/…`; on an older version use a pack, a URL or `public/` |
| Build fails on a machine without network | `highlighting: { offline: true }` or `onError: 'warn'`; see also `ASTROC4_OFFLINE=1` |
| `Could not resolve reference to ElementKind named 'x'` | a model error: declare the kind in `specification { element x }` |

Full detail lives in the wiki: `docs/wiki/guide/Getting-Started.md`,
`docs/wiki/guide/Projects.md`, `docs/wiki/guide/Fences.md`,
`docs/wiki/guide/Plain-Astro.md`, `docs/wiki/Troubleshooting.md`.
