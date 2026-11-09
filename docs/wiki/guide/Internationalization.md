# Internationalization

Every string the Astro components render comes from Starlight's i18n system, so a
site that already ships a second language gets the diagram UI in it for free.

Two cases are English-only:

- **Fences in `.md` pages.** Their placeholder is plain HTML mounted by a page
  script, with no server component to call `t()`, so it uses the English
  defaults.
- **Sites without Starlight.** `Astro.locals.t` does not exist there, and
  `getTranslator()` falls back to English.

## The keys

| Key | Rendered where |
| --- | --- |
| `likec4.view.title` | Default heading of `<LikeC4View>` |
| `likec4.view.description` | Default sub-heading of `<LikeC4View>` |
| `likec4.view.hint` | The hint line in the shell |
| `likec4.view.badge` | The "click any node" badge |
| `likec4.view.loading` | The island placeholder |
| `likec4.fence.title` | Default heading of a diagram fence in `.mdx` |
| `likec4.fence.hint` | The hint line for fences in `.mdx` |
| `likec4.fence.loading` | The fence island's placeholder in `.mdx` |
| `likec4.error.title` | Error boundary heading |
| `likec4.error.body` | Error boundary body |
| `likec4.error.retry` | Retry button |
| `likec4.error.viewIdRequired` | `<LikeC4View>` without a `viewId` |
| `likec4.error.noProjects` | No compiled LikeC4 project |
| `likec4.error.unknownProject` | A `project` that does not exist (also the build error's text) |
| `likec4.error.projectRequired` | No `project` on a site with several projects (also the build error's text) |
| `likec4.error.unresolvedProject` | A project that cannot be resolved |
| `likec4.error.loadFailed` | A project that failed to load |

## Overriding them

Add any of those keys to the site's i18n content file, exactly as you would for
Starlight's own strings:

```json
// src/content/i18n/fr.json
{
  "likec4.view.title": "Diagramme d’architecture",
  "likec4.view.hint": "Cliquez sur un nœud pour ouvrir ses détails.",
  "likec4.error.viewIdRequired": "Un viewId LikeC4 est requis"
}
```

Keys you leave out fall back to English.

## Placeholders are single-braced

`likec4.error.unknownProject` and `likec4.error.loadFailed` take a `{projectId}`,
and the "available projects" list (in `unknownProject` and `projectRequired`) is
`{available}`. They use **single** braces,
not i18next's `{{name}}`:

```
'likec4.error.unknownProject': 'Unknown LikeC4 projectId "{projectId}". Available projects: {available}.'
```

The reason is that some values are only known in the browser — the list of
compiled projects, for one — so the template has to reach the island
unformatted. `format()` in `src/components/labels.ts` fills them client-side;
`t()` does not exist there.

## How it reaches the client

Astro components translate on the server with `getTranslator(Astro.locals.t)`
and pass the island a plain object of already-translated strings
(`IslandLabels`). The islands never import the translation system, which is why
the error messages in the browser are still translated even though they are
interpolated after hydration.
