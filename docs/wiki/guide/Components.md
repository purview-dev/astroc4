# Components

Two Astro components are exported. One is for authors; the other exists for the
fence transform.

## `<LikeC4View>`

```mdx
import LikeC4View from '@purview-dev/astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
<LikeC4View viewId="edge" projectId="my-project" title="Edge cases" collapsible={false} />
```

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `viewId` | `string` | required | Which view to render. |
| `projectId` | `string` | the first project found | Which compiled LikeC4 project. |
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

Components use plain CSS over Starlight's design tokens (`--sl-color-*`), with no
utility classes and no Tailwind: a host's Tailwind does not scan this package, so
utility classes would silently be unstyled. Override with CSS targeting:

| Class | Element |
| --- | --- |
| `likec4-shell` | The outer `<section>` |
| `likec4-shell__header` / `__title` / `__description` / `__hint` | The `<summary>` and its parts |
| `likec4-shell__body` | The content area |
| `likec4-frame` | The sized container (also carries `--likec4-height`) |
| `likec4-badge` | The "click a node" badge `<LikeC4View>` adds |
| `likec4-loading` | The pre-hydration placeholder |
| `likec4-error` | The error boundary's output |

`class="not-content"` on the shell is Starlight's opt-out from prose styles.

## Client islands

The islands are `@likec4/core` plus `likec4/react`, wrapped in an error boundary
that renders translated text and a retry button. Two details matter if you change
them:

- client code imports `@likec4/core/model`, never `likec4/model` — the latter is
  the Node entry point and drags `createRequire` into the browser bundle, which
  fails at hydration;
- `client:only` fallbacks need `slot="fallback"`, or Starlight parks them in an
  inert `<template>` and never paints them.
