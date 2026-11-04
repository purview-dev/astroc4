# Getting Started

Four files stand between an empty Starlight site and a rendered diagram.

## 1. Install

```sh
bun add @purview-dev/astroc4
```

Astroc4 declares its peers, so Bun and npm install them with it. Under pnpm,
install them explicitly: `astro`, `@astrojs/starlight`, `@astrojs/react`,
`@astrojs/markdown-satteri`, `likec4`, `@likec4/core`, `react`, `react-dom`,
`shiki`.

## 2. Register the plugin

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import astroc4 from '@purview-dev/astroc4';

export default defineConfig({
	integrations: [starlight({ title: 'My docs', plugins: [astroc4()] }), react()],
});
```

React is required: the diagrams are React islands (`likec4/react`).

## 3. Write a model

```
# src/likec4/demo.c4
specification {
  element system
  element person
}
model {
  reader = person 'Reader'
  docs = system 'Docs site'
  reader -> docs 'reads'
}
views {
  view index { include * }
}
```

The file has to sit in a directory with a `likec4.config.json` (an empty `{}` is
fine). Astroc4 compiles **every** project under the site root and the first one
found is the default, so keep exactly the projects you mean to render there.

## 4. Use it

```mdx
---
title: Architecture
---

import LikeC4View from '@purview-dev/astroc4/components/LikeC4View.astro';

<LikeC4View viewId="index" height={560} />
```

Or write the diagram inline, in the page:

````mdx
```likec4 title="Request path"
specification { element box }
model {
  a = box 'Alpha'
  b = box 'Beta'
  a -> b 'calls'
}
views { view index { include * } }
```
````

Both forms draw the same island. The fence is compiled during the build, so a
typo in the DSL fails `astro build` with the file name and the parser's message.

## Writing the model

The DSL inside a fence, or in a `.c4` file under `src/likec4`, is LikeC4's
language rather than astroc4's: this package renders what you wrote, and fails the
build when it cannot. If an agent is writing the model, give it the official
LikeC4 DSL skill as well — it carries the rules that are easy to get wrong
without a model in your head:

```sh
npx skills add https://github.com/likec4/likec4 --skill likec4-dsl
```

The ones that catch people out: FQNs must be unique per project and use dots
(`payment.api` is not an identifier, `payment-api` is); scoping does not cross
file boundaries, so a reference in another file needs the full path
(`cloud.backend.api`); a project is the directory of the nearest config file
(`likec4.config.json`, `.like4rc`); and `summary`/`description`/`notes` take
Markdown in triple quotes. It also covers the CLI, which is what
`bun run likec4:validate` wraps.

## Check it worked

```sh
bun x astro build
```

Things to look for:

- the build log has a `[astroc4] LikeC4 grammar likec4/likec4@main (…)` line —
  that is the highlighting grammar being resolved;
- the page's HTML contains `class="… likec4-frame …"` once per diagram;
- a ` ```c4 ` fence on some page renders in several colours.

If the diagrams render but the colours do not, see
[Troubleshooting](../Troubleshooting.md).

## Next

- Point the fence at a view instead of repeating the DSL: [Fences](Fences.md).
- Pin the grammar version: [Syntax Highlighting](Syntax-Highlighting.md).
- Translate the shell: [Internationalization](Internationalization.md).
