---
name: purview-astroc4-plugin
description: >-
  Use when adding or changing LikeC4 diagrams in an Astro or Starlight site with astroc4 - wiring the
  Starlight plugin, choosing between a ```likec4 fence and <LikeC4View>, understanding why
  highlighting needs no ec.config.mjs, diagnosing a diagram that renders but is uncoloured, or a
  fence that stayed a code block.
license: MIT
metadata:
  product: astroc4
  repository: purview-dev/astroc4
---

# astroc4: diagrams in a Starlight site

Astroc4 is a Starlight plugin. One call wires LikeC4's Vite plugin, the fence
transform, syntax highlighting and the UI strings.

## Wiring

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import astroc4 from '@purview-dev/astroc4';

export default defineConfig({
	integrations: [starlight({ plugins: [astroc4()] }), react()],
});
```

React is required — the diagrams are React islands (`likec4/react`). A `.c4`
project needs a `likec4.config.json` beside it; `{}` is enough.

## Choosing a form

| Need | Use |
| --- | --- |
| A diagram whose DSL belongs next to the prose | ` ```likec4 ` fence with inline DSL, in an `.mdx` page |
| A view of the model that already lives in `src/likec4` | ` ```likec4 view="id" ` or `<LikeC4View viewId="id" />` |
| Show LikeC4 *source* rather than a diagram | ` ```c4 ` fence, or `<Code lang="likec4">` |

A ` ```likec4 ` fence in a `.md` page cannot become a component, so it stays a
code block and warns. That is the most common "it did not render" cause.

## Highlighting is not configured by the site

The plugin resolves the Langium grammar from likec4/likec4 and injects it into
Starlight's Expressive Code options from its `config:setup` hook. Consequences:

- do **not** add an `ec.config.mjs` for LikeC4; if one already exists it keeps
  working (Expressive Code concatenates `shiki.langs`);
- if the site sets `expressiveCode: false` there are no code blocks to colour,
  and the plugin says so with a warning;
- Starlight 0.42.8 is a hard floor — the hook argument and the `updateConfig`
  key it relies on do not exist earlier.

## Diagnosing

| Symptom | Check |
| --- | --- |
| No colours anywhere | `expressiveCode: false`? which fence language? does `<pre data-language="c4">` contain several `--0:#…` values? |
| Diagrams blank but the build passes | a static build passes even when islands fail to hydrate — use the browser smoke test, not the exit code |
| "Unknown LikeC4 projectId" | a stray `.c4` project became the default; keep only the projects you mean to render or pass `projectId` |
| Build fails on a machine without network | `highlighting: { offline: true }` or `onError: 'warn'`; see also `ASTROC4_OFFLINE=1` |
| `Could not resolve reference to ElementKind named 'x'` | a model error: declare the kind in `specification { element x }` |

Full detail lives in the wiki: `docs/wiki/guide/Getting-Started.md`,
`docs/wiki/guide/Fences.md`, `docs/wiki/Troubleshooting.md`.
