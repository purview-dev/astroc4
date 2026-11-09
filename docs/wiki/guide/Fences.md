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

That is the same thing as `<LikeC4View viewId="pageLoad" />`, in fence form.

## Options

` ```likec4 view="…" title="…" description="…" height=420 collapsible=false defaultOpen=false `

| Key | Default | Meaning |
| --- | --- | --- |
| `view` | first view in the snippet; required when the fence is empty | Which view to render |
| `title` | translated `Diagram` | Shell heading |
| `description` | — | Shell sub-heading |
| `height` | `420` | Height in pixels |
| `collapsible` | `true` | Render the shell as a `<details>` |
| `defaultOpen` | `true` | Whether it starts open |

Values may be double-quoted, single-quoted or bare (`height=320`). An empty
quoted value is allowed (`description=""`) and is dropped from the component's
props.

## What the build does

1. The fence's meta string is parsed into those keys.
2. An empty fence becomes the `<LikeC4View>` component with `viewId`.
3. A fence with source is compiled by LikeC4's Node API (`LikeC4.fromSource`) and
   laid out; the resulting plain-JSON model is passed to the fence component as
   a serialised prop.
4. The component import is inserted once per page, after every fence on the page
   has been seen.

Layouted snippets are memoised by a hash of their source, so a build pays for a
snippet once even though the page is re-rendered on every dev edit.

## Errors you will see

| Message | Cause |
| --- | --- |
| ``…is empty, so it needs `view="<id>"` to name a view in the project model.`` | An empty fence with no `view`. |
| ``…is not valid LikeC4 — <parser message>`` | The DSL does not parse; the file name and only the first line of each parser error are shown. |
| ``…has no view "<id>". Declared: <list>.`` | The named view is not in the snippet. |
| ``…uses file="…", which is outside the site`` | A fence's `file=` resolves outside the site root. |

## Fences versus components

| | Fence | `<LikeC4View>` |
| --- | --- | --- |
| Source | DSL in the page, or a view of the site's model | The site's `.c4` model only |
| Reviewable diff | The model *is* the page | The model is elsewhere |
| Layout | Build time | Build time (Vite plugin) |
| Use when | The diagram is local to the page, or you want the DSL next to the prose | The model is shared and already in `src/likec4` |
