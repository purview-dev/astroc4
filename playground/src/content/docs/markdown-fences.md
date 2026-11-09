---
title: Fences in Markdown
description: "likec4 fences in a plain .md page — no .mdx needed."
---

This page is plain Markdown. Its fences render as diagrams all the same: the
fence is compiled and laid out at build time, and a script astroc4 adds mounts
it in the browser.

## Inline

```likec4 title="Inline in .md" height=300
specification {
  element box
}
model {
  page = box 'A .md page'
  site = box 'The built site'
  page -> site 'renders as a diagram'
}
views {
  view mdInline {
    include *
  }
}
```

## From the project model

```likec4 view="pageLoad" project="playground" title="A page load, from .md" height=360
```
