# Components

Two Astro components are exported. One is for authors; the other exists for the
fence transform. A third export, `@purview-dev/astroc4/components/md-fences`, is
the browser module that mounts fences in `.md` pages; nothing imports it by hand.

## `<LikeC4View>`

```mdx
import LikeC4View from '@purview-dev/astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
<LikeC4View viewId="edge" project="architecture" title="Edge cases" collapsible={false} />
<LikeC4View viewId="flow" file="diagrams/flow.c4" />
```

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `viewId` | `string` | required | Which view to render. |
| `project` | `string` | the only project; required when there are several | A [named or discovered project](Projects.md). An unknown name fails the build. |
| `file` | `string` | — | A single `.c4` file relative to `src/` (and under it), compiled at build time, instead of a project. |
| `projectId` | `string` | — | Deprecated alias of `project`. |
| `title` | `string` | translated `likec4.view.title` | Shell heading. |
| `description` | `string` | translated `likec4.view.description` | Shell sub-heading. |
| `height` | `number` | `480` | Frame height in pixels. |
| `collapsible` | `boolean` | `true` | Render the shell as a `<details>`. |
| `defaultOpen` | `boolean` | `true` | Whether it starts open. |

It renders a shell (`<section class="not-content likec4-shell">`) around a sized
frame, and puts the LikeC4 React island inside as `client:only="react"` — the
diagram has no useful server-rendered form, and the loading placeholder carries
the frame's height so the page does not jump when it hydrates.

## `<LikeC4Fence>`

The target of the fence transform. Authors do not import it; `src/fences.ts`
rewrites a ` ```likec4 ` fence into it and passes the model it compiled at build
time as a JSON string.

| Prop | Type | Meaning |
| --- | --- | --- |
| `model` | `string` | The layouted model, JSON-encoded by the fence plugin. |
| `viewId` | `string` | Which view of that model to draw. |
| `title` / `description` | `string` | Shell heading and sub-heading. |
| `height` | `string` | Pixel height; arrives as a string through the MDX attribute. |
| `collapsible` / `defaultOpen` | `string` | `"false"` turns the behaviour off. |

It throws if `model` is not valid JSON — a fence cannot produce anything else, so
that is always a plugin bug and should be loud.

## Styling

Components use plain CSS, with no utility classes and no Tailwind: a host's
Tailwind does not scan this package, so utility classes would silently be
unstyled.

Colours come from a small `--likec4-*` layer that defaults to Starlight's design
tokens and to scheme-neutral fallbacks (translucent greys, `inherit`) when those
tokens are absent — which is the plain Astro case:

| Token | When unset | Used for |
| --- | --- | --- |
| `--likec4-border` | `var(--sl-color-gray-5, rgba(128, 128, 128, 0.35))` | Shell, header and badge borders |
| `--likec4-surface` | `var(--sl-color-bg, transparent)` | Header, badge and placeholder background |
| `--likec4-surface-alt` | `var(--sl-color-bg-nav, rgba(128, 128, 128, 0.06))` | Shell background |
| `--likec4-text` | `var(--sl-color-white, inherit)` | Shell title |
| `--likec4-text-muted` | `var(--sl-color-gray-2, rgba(128, 128, 128, 0.95))` | Description, badge, loading label |
| `--likec4-accent` | `var(--sl-color-text-accent, inherit)` | The hint line |
| `--likec4-skeleton` | `var(--sl-color-gray-6, rgba(128, 128, 128, 0.18))` | Loading lines |
| `--likec4-danger`, `--likec4-danger-soft`, `--likec4-danger-text` | Starlight's `--sl-color-red`, `-red-low`, `-red-high`, else a red palette | The error boundary |

### Overriding the colours

Set any token on any ancestor: `:root`, a page wrapper, or `.likec4-shell`
itself.

```css
:root {
	--likec4-border: #d4d4d8;
	--likec4-surface: #ffffff;
	--likec4-surface-alt: #f6f6f7;
	--likec4-text: #18181b;
	--likec4-text-muted: #52525b;
	--likec4-accent: #0046be;
}
```

The components never declare these tokens; they only read them, through private
`--_likec4-*` properties that add the fallbacks. So a site's value is inherited
rather than overridden by the components' scoped styles, and it reaches the
frame, badge and placeholder as well as the shell. `.md` fences read the same
tokens.

To change anything other than colour, target the classes. Astro scopes component
styles as a class plus an attribute, so a site rule needs more specificity than
that, e.g. `html .likec4-shell[class]`:

| Class | Element |
| --- | --- |
| `likec4-shell` | The outer `<section>` |
| `likec4-shell__header` / `__title` / `__description` / `__hint` | The `<summary>` (or `<header>` when not collapsible) and its parts |
| `likec4-shell__body` | The content area |
| `likec4-frame` | The sized container (also carries `--likec4-height`) |
| `likec4-badge` | The "click a node" badge `<LikeC4View>` adds |
| `likec4-loading` | The pre-hydration placeholder |
| `likec4-error` | The error boundary's output |
| `likec4-md-fence` | A `.md` page's fence (inline styles over the same tokens) |

`class="not-content"` on the shell is Starlight's opt-out from prose styles; on a
plain Astro site it is inert.

## Client islands

The islands are `@likec4/core` plus `likec4/react`, wrapped in an error boundary
that renders translated text and a retry button. Two details matter if you change
them:

- client code imports `@likec4/core/model`, never `likec4/model` — the latter is
  the Node entry point and drags `createRequire` into the browser bundle, which
  fails at hydration;
- `client:only` fallbacks need `slot="fallback"`, or Astro parks them in an
  inert `<template>` and never paints them.
