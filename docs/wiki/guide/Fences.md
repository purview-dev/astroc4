# Fences

A ` ```likec4 ` fence is a diagram, in `.md` and `.mdx` pages alike. Either way it
is compiled and laid out at build time, so the page carries a laid-out model
rather than DSL:

- in `.mdx`, the fence is rewritten into a component;
- in `.md`, which cannot hold a component, it becomes a placeholder with the same
  model, and a page script astroc4 injects mounts the diagram in the browser. That
  script loads the diagram code only on a page that has a placeholder.

## Two forms

**Inline DSL** — the fence contains LikeC4 source. It is compiled and laid out
during the build, and a typo fails the build:

````mdx
```likec4 title="Request path" height=320
specification { element box }
model {
  a = box 'Alpha'
  b = box 'Beta'
  a -> b 'calls'
}
views { view index { include * } }
```
````

**A view of the site's model** — the fence is empty and names a view:

````mdx
```likec4 view="pageLoad" title="A page load" height=360
```
````

That is the same thing as `<LikeC4View viewId="pageLoad" />`, in fence form. On a
site with several projects, add `project="<name>"` (see [Projects](Projects.md)).

**A `.c4` file** — the fence is empty and points at a file, relative to the page:

````mdx
```likec4 file="./flows/request.c4" view="request"
```
````

The file is compiled and laid out exactly like inline DSL. It has to be inside
the site root.

## Options

` ```likec4 view="…" project="…" file="…" title="…" description="…" height=420 collapsible=false defaultOpen=false `

| Key | Default | Meaning |
| --- | --- | --- |
| `view` | the first view the source declares; required when the fence is empty | Which view to render |
| `project` | the only project; required when there are several | For an empty fence: which project the view is in |
| `file` | — | A `.c4` file, relative to the page, rendered instead of the fence body |
| `title` | `Diagram` (translated in `.mdx`) | Shell heading |
| `description` | — | Shell sub-heading |
| `height` | `420` | Height in pixels |
| `collapsible` | `true` | Render the shell as a `<details>` |
| `defaultOpen` | `true` | Whether it starts open |

Values may be double-quoted, single-quoted or bare (`height=320`). An empty
quoted value is allowed (`description=""`) and is dropped from the component's
props.

"The first view the source declares" means the first `view <id>` in the
source. LikeC4 adds an automatic `index` overview to every model, and the fence
skips it unless the source declares `view index` itself.

## `.md` versus `.mdx`

Both are compiled and validated the same way at build time, `project` included,
and take the same options. What differs is how the diagram reaches the page:

| | `.mdx` | `.md` |
| --- | --- | --- |
| Rendered as | `<LikeC4Fence>` / `<LikeC4View>` | a `<section class="likec4-md-fence">` placeholder, mounted by the page script |
| Shell | heading, description, hint, badge; collapsible | heading and description; collapsible |
| UI strings | translated through Starlight's i18n | English |

## What the build does

1. The fence's meta string is parsed into those keys.
2. An empty fence with no `file` keeps the view name: in `.mdx` it becomes the
   `<LikeC4View>` component, in `.md` a placeholder carrying `viewId` and
   `project`.
3. A fence with source (inline or `file=`) is compiled by LikeC4's Node API
   (`LikeC4.fromSource`) and laid out. The resulting plain-JSON model is passed
   to `<LikeC4Fence>` as a serialised prop in `.mdx`, or written into the
   placeholder's `data-model` attribute in `.md`.
4. In `.mdx`, the component imports are inserted once per page, after every fence
   on the page has been seen. In `.md`, the page script astroc4 injects
   on every page loads the diagram code only when it finds a placeholder.

Layouted snippets are memoised by a hash of their source, so a snippet is
compiled once per process, even though the dev server re-renders the page on
every edit.

## Partial and invalid examples

A fence that cannot be turned into a diagram fails `astro build` — and `astro
check` with it, because both run the same content transform. That covers more
than a compile error: a view its own DSL does not declare, an empty fence with
no `view`, a `project` that does not exist, a `file=` that does not resolve. A
tutorial or example page, though, often shows deliberately incomplete DSL.
`validation` picks what happens:

- `'strict'` — the default. The build and `astro check` fail, naming the page,
  the fence and the reason.
- `'relaxed'` — the reason is logged as a warning instead, and the fence is left
  in the page, where it highlights as a code block.

A single mode covers the whole site:

```ts
starlight({
	plugins: [astroc4({ validation: 'relaxed' })],
});
```

Or relax only part of it — a content collection, a content area, a section, one
page:

```ts
starlight({
	plugins: [
		astroc4({
			validation: {
				default: 'strict',
				// Whole collections, by name.
				collections: ['tutorials'],
				// Or page paths, relative to the site root (`*` within a segment,
				// `**` across them).
				relaxed: ['src/content/docs/examples/**'],
			},
		}),
	],
});
```

A collection is the first folder under the content directory
(`src/content/<name>/…`), which is how Astro's `glob` loader maps a collection to
a folder. The plain-Astro integration takes the same option.

## Errors you will see

| Message | Cause |
| --- | --- |
| ``…is empty, so it needs `view="<id>"` to name a view in the project model.`` | An empty fence with no `view`. |
| ``…is not valid LikeC4 — <parser message>`` | The DSL does not parse; the file name and the first line of the first three parser errors are shown. |
| ``…has no view "<id>". Declared: <list>.`` | The named view is not in the snippet. |
| ``…uses file="…", which is outside the site`` | A fence's `file=` resolves outside the site root. |
| ``…uses file="…", which does not exist`` | A fence's `file=` names a missing file. |
| ``Several LikeC4 projects exist (…); pass project="…".`` | An empty fence on a site with several projects. |
| ``Unknown LikeC4 projectId "<name>". Available projects: …`` | An empty fence whose `project` does not exist. |

## Fences versus components

| | Fence | `<LikeC4View>` |
| --- | --- | --- |
| Source | DSL in the page, a `.c4` file, or a view of the site's model | A project's model, or a `.c4` file under `src/` |
| Reviewable diff | The model *is* the page | The model is elsewhere |
| Layout | Build time | Build time (Vite plugin, or the file-layout plugin for `file`) |
| Pages | `.md` and `.mdx` | `.mdx` (and `.astro`) |
| Use when | The diagram is local to the page, or you want the DSL next to the prose | The model is shared and already in `src/likec4` |
