# Astroc4 — views, fences and highlighting

Astroc4 is a Starlight plugin that puts [LikeC4](https://likec4.dev) diagrams
into an Astro documentation site. It is deliberately small in surface area and
strict about failure: a diagram that cannot be compiled, or a syntax grammar that
cannot be resolved, stops the build instead of shipping something broken.

## The three things it does

1. **Compiles your model.** LikeC4's `LikeC4VitePlugin` is registered for you, so
   every `.c4` project under the site root becomes the `likec4:model`,
   `likec4:icons` and `likec4:projects` modules the components read.
2. **Turns ` ```likec4 ` fences into diagrams.** Either the fence contains DSL
   (compiled and laid out during the build) or it names a view of the site's
   model. Both render as hydrated islands; layout happens on the build machine.
3. **Highlights LikeC4 source.** A TextMate grammar, derived from the Langium
   grammar in `likec4/likec4` at the ref you choose, is registered with
   Expressive Code — no `ec.config.mjs` required.

## Why the grammar is derived

Shiki ships no LikeC4 grammar, and a hand-maintained one drifts: LikeC4 added
`agent` to `ElementShape` after `v1.59.4`, and the TextMate grammar its VS Code
extension ships still does not know about it. Astroc4 reads the *language* from
the repository at build time and generates the grammar, so a new shape, keyword
or property name is highlighted in the next release without anyone editing a
word list. See [Syntax Highlighting](Syntax-Highlighting.md).

## Why layout happens at build time

LikeC4 lays out diagrams with a WASM graph engine. Running it in the browser
would ship that engine to every reader; running it during the build means the
page carries a plain JSON model and the island only rehydrates it. The
consequence is that an invalid model fails `astro build`, which is the behaviour
you want in a documentation pipeline.

## Documentation map

| Page | What it answers |
| --- | --- |
| [Getting Started](Getting-Started.md) | What do I type to see a diagram? |
| [Configuration Reference](Configuration-Reference.md) | Every option, default and environment variable. |
| [Syntax Highlighting](Syntax-Highlighting.md) | How the grammar is fetched, derived, cached and validated. |
| [Fences](Fences.md) | Fence forms, meta options, error messages. |
| [Components](Components.md) | `<LikeC4View>`, props, styling, client islands. |
| [Icons](Icons.md) | Which icon ids work, and the one kind that does not. |
| [Internationalization](Internationalization.md) | The translation keys and how to override them. |
| [Architecture](Architecture.md) | Module map and data flow, for changing the code. |
| [Local Development](Local-Development.md) | Scripts, the playground, and how to verify a change. |
| [Repository CI/CD](Repository-CI-CD.md) | The workflows, the release flow, the secrets. |
| [Troubleshooting](Troubleshooting.md) | The failures people actually hit. |
| [Roadmap](Roadmap.md) | Phase 1 vs Phase 2. |
