# astroc4

A Starlight plugin for interactive [LikeC4](https://likec4.dev) architecture
diagrams.

- `<LikeC4View viewId="…" />` — render a view from the site's `.c4` model.
- ` ```likec4 ` fences in `.mdx` — either inline DSL, compiled and laid out at
  build time, or an empty fence with `view="…"` pointing at the model.
- LikeC4 syntax highlighting for Expressive Code (`.c4` files, ` ```c4 `).
- Every UI string translatable through Starlight's i18n.

## Install

```sh
bun add astroc4@file:../path/to/astroc4
```

It is not published yet; `file:` copies the package into `node_modules`, so
after changing the plugin run `bun install` in the site again (and restart its
dev server). The site also needs the peer dependencies: `astro`,
`@astrojs/starlight`, `@astrojs/react`, `@astrojs/markdown-satteri`, `likec4`,
`@likec4/core`, `react`, `react-dom`.

## Use

```js
// astro.config.mjs
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import astroc4 from 'astroc4';

export default defineConfig({
 integrations: [starlight({ plugins: [astroc4()] }), react()],
});
```

```js
// ec.config.mjs — highlighting; Expressive Code only reads this file
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { likec4Language } from 'astroc4/expressive-code';

export default defineEcConfig({ shiki: { langs: [likec4Language] } });
```

```mdx
import LikeC4View from 'astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
```

The plugin registers `LikeC4VitePlugin`, which compiles every
`likec4.config.json` project under the site root. Keep exactly the projects you
mean to render there: the first one found is the default for `<LikeC4View>`
without a `projectId`, so a stray `.c4` project (a vendored example, say) can
silently replace your own.

### Options

| Option | Default | |
| --- | --- | --- |
| `vitePlugin` | `{}` | Passed to `LikeC4VitePlugin`, e.g. `{ workspace: 'diagrams' }`. |
| `fences` | `true` | Turn ` ```likec4 ` fences into diagrams. |

### `<LikeC4View>` props

| Prop | Type | Default |
| --- | --- | --- |
| `viewId` | `string` | required |
| `projectId` | `string` | first project |
| `title` / `description` | `string` | translated defaults |
| `height` | `number` | `480` |
| `collapsible` / `defaultOpen` | `boolean` | `true` |

### Fence options

` ```likec4 view="…" title="…" description="…" height=420 collapsible=false defaultOpen=false `

### Translating

Add any key from `src/translations.mjs` to the site's
`src/content/i18n/<lang>.json`. Placeholders are `{name}` — single braces,
because some are filled in by the browser, not by i18next.

## Icons

Use a bundled pack (`azure:`, `aws:`, `gcp:`, `tech:`, `bootstrap:`), an
absolute URL, or a file under the site's `public/` referenced by a path
relative to the `.c4` file. Don't use LikeC4's `imageAliases`: the compiler
bakes a build-machine `file://` path into the client bundle.

## Develop

```sh
bun install
bun run dev          # playground at http://localhost:4321 (English + French)
bun run test         # unit tests: helpers, labels, fence meta, grammar
bun run check        # astro check over playground/ and src/
bun run build && bun run preview
bun scripts/smoke.mjs http://localhost:4321   # headless: hydration, icons, highlighting, i18n
```

Open the folder in VS Code and install the recommended **LikeC4** extension
for the language server: diagnostics, go-to-definition, hover and a live
preview of `.c4` files.
