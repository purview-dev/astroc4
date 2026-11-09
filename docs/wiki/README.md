# astroc4

Interactive [LikeC4](https://likec4.dev) architecture diagrams for
[Astro](https://astro.build) and [Starlight](https://starlight.astro.build).

```sh
bun add @purview-dev/astroc4
```

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import astroc4 from '@purview-dev/astroc4';

export default defineConfig({
	integrations: [starlight({ plugins: [astroc4()] }), react()],
});
```

```mdx
import LikeC4View from '@purview-dev/astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
```

That is the whole setup: the site's `.c4` model is compiled by LikeC4's Vite
plugin, ` ```likec4 ` fences become diagrams, and LikeC4 source is highlighted by
Expressive Code with no `ec.config.mjs`.

It also works without Starlight. `@purview-dev/astroc4/integration` is a plain
`AstroIntegration` that adds the same model compiler and fence transform, and
adds `@astrojs/react` when the site has not. The site supplies `@astrojs/mdx`
(only for components and fences in `.mdx`) and, only for highlighting,
`astro-expressive-code` given `likec4Language`. See
[Plain Astro](guide/Plain-Astro.md).

## What it gives you

| | |
| --- | --- |
| `<LikeC4View viewId="…" />` | Render a view from the site's `.c4` model, as a hydrated island. Projects are found by any LikeC4 config file, JSON or JS/TS. |
| ` ```likec4 ` fences | Inline DSL compiled and laid out **at build time**, or an empty fence with `view="…"`. A typo fails the build. |
| Syntax highlighting | A TextMate grammar derived from the Langium grammar in [likec4/likec4](https://github.com/likec4/likec4) at a ref you choose, registered with Expressive Code. |
| Translatable UI | Every string the Astro components render goes through Starlight's i18n (fences in `.md` pages are English-only). |
| Fails like a build | A bad grammar ref, an unreachable repository or an invalid fence fails `dev`, `build`, `check` and `sync`. |

## Documentation

The pages are grouped by what you are doing. Every folder has a `README.md` that
lists its own pages.

| | |
| --- | --- |
| [guide](guide/README.md) | Using the plugin: getting started, projects, fences, components, highlighting, icons, i18n, options. |
| [contributing](contributing/README.md) | Changing it: the module map, the local workflow, CI and releases. |
| [Troubleshooting](Troubleshooting.md) | The failures people actually hit. |

Start with [Getting Started](guide/Getting-Started.md) — a site with a diagram, in
four files.

## Requirements

Astro 7.4.4, React 19, LikeC4 1.59.4 and Node 22.19 (or Bun 1.4.4). Starlight
0.42.8 is required for the plugin entry point (`@purview-dev/astroc4`), not for
`@purview-dev/astroc4/integration`. The peer ranges are declared in
`package.json`; the Starlight floor is load-bearing, because the plugin relies on
a `config:setup` hook argument and an `updateConfig` key that earlier versions do
not have.
