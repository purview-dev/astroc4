# Projects

A diagram comes from one of three places:

| Source | How it is chosen | Compiled by |
| --- | --- | --- |
| A **discovered** project | every LikeC4 config file under the site root | LikeC4's Vite plugin |
| A **named** project | `projects: { <name>: <folder> }` in the options | LikeC4's Vite plugin |
| A **single file** | `<LikeC4View file="…">` or a fence's `file="…"` | astroc4, at build time, like an inline fence |

## Config files

A project is a folder holding one of LikeC4's config files. Astroc4 reads every
name LikeC4 reads, the same way LikeC4 reads it:

| File | Read as |
| --- | --- |
| `.likec4rc`, `.likec4.config.json`, `likec4.config.json` | JSON5 (comments and trailing commas allowed) |
| `likec4.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` | bundled with esbuild and evaluated |

```ts
// src/likec4/likec4.config.ts
import { defineConfig } from 'likec4/config';

export default defineConfig({
	name: 'docs',
	imageAliases: { '@': './images' },
});
```

`likec4/config` is replaced with a stand-in while the file is evaluated, as LikeC4
does, so a project outside the site does not need the package installed beside
it. When a folder has several config files, the first in the table's order wins.

`name` is optional. Without it the project is named after its folder, as LikeC4
names it, so `{}` in `src/likec4/likec4.config.json` is the project `likec4`.
`node_modules` and dot folders are never searched.

## Named projects

`projects` adds LikeC4 projects from anywhere: a sibling folder, another
checkout, an absolute path. The key is the name pages use. The project's own
config, model, `imageAliases` and relative icons are used as they are.

```ts
astroc4({ projects: { architecture: '../../docs/architecture/likec4' } });
```

```mdx
<LikeC4View project="architecture" viewId="c1-context" />
```

Paths are relative to the site root, or absolute. A folder that does not exist,
or has no LikeC4 config file, fails the build with the path.

LikeC4's Vite plugin compiles a single folder, so named and discovered projects
are linked (as directory junctions or symlinks, never copies) into
`.astro/astroc4/workspace`, and the plugin is pointed there. Edits to the
original `.c4` files reload in `astro dev` like any other.

## Choosing a project on a page

| Projects on the site | `project` omitted | `project="x"` |
| --- | --- | --- |
| One | that project | must be its name |
| Several | **the build fails** and lists the names | must be one of them |

An unknown name fails the build the same way, for `<LikeC4View>` and for empty
` ```likec4 ` fences in `.md` and `.mdx` alike. Two projects with the same name,
or whose configs declare the same `name`, fail the build and name both folders.

## Taking discovery over

Setting `vitePlugin.workspace` (or `vitePlugin.languageServices`) hands discovery
to LikeC4. Astroc4 then ignores `projects` (with a warning) and does not know
the project names at build time, so `project` is checked by the island in the
browser rather than by the build.

## Single files

```mdx
<LikeC4View viewId="flow" file="diagrams/flow.c4" />
```

`file` on `<LikeC4View>` is relative to the site's `src/` and must stay under it.
On a fence, `file="…"` is relative to the page and must stay inside the site.
Either way the file is compiled and laid out at build time, on its own, so it
cannot reference elements from another project.

Back to the [guide index](README.md).
