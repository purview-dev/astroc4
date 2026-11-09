# Configuration Reference

Everything is configured through one call, and that call is one of two:

```js
// Starlight: the plugin entry point
starlight({
	plugins: [
		astroc4({
			fences: true,
			projects: { architecture: '../../docs/architecture/likec4' },
			highlighting: { ref: 'v1.60.0' },
		}),
	],
});
```

```js
// Plain Astro: the integration entry point
integrations: [astroc4(), expressiveCode(), mdx(), react()];
```

`highlighting` exists only on the Starlight plugin, because it is an injection
into Starlight's `expressiveCode` option; a plain Astro site configures
Expressive Code itself ([Plain Astro](Plain-Astro.md#highlighting)). Everything
else is shared, because both entry points call the same integration.

## Top-level options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `fences` | `boolean` | `true` | Turn ` ```likec4 ` fences into diagrams. `false` leaves them as code blocks. |
| `projects` | `Record<string, string>` | `{}` | Named LikeC4 projects: name → folder holding a `likec4.config.json`, relative to the site root or absolute. Compiled alongside the projects discovered under the site root; their `imageAliases` and relative icons work unchanged. |
| `vitePlugin` | `object` | `{}` | Passed straight to LikeC4's `LikeC4VitePlugin`. Setting `workspace` or `languageServices` takes discovery over, and `projects` is then ignored with a warning. |
| `highlighting` | `true` \| `false` \| `HighlightingOptions` | `true` | **Starlight only.** Highlight LikeC4 source. `false` leaves Expressive Code entirely to the site. |

## Highlighting options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `ref` | `string` | `'main'` | Branch, tag or commit SHA of `likec4/likec4` to read `like-c4.langium` from. Pin a tag or SHA in CI. |
| `repo` | `string` | `'likec4/likec4'` | Repository to read from — a fork or an internal mirror. |
| `offline` | `boolean` | `false` | Use the grammar snapshot bundled with the package; never touch the network. |
| `onError` | `'fail'` \| `'warn'` \| `'silent'` | `'fail'` | What to do when the grammar cannot be **fetched**. A ref that does not exist always fails, and so does a file that is no longer a LikeC4 grammar. |
| `cacheTtl` | `number` | `3600` | Seconds a cached fetch stays fresh. |
| `refresh` | `boolean` | `false` | Ignore the cache and refetch. |
| `cacheDir` | `string` | the site's `node_modules` folder, in `astroc4`'s cache folder | Where to cache. |
| `baseUrl` | `string` | `https://raw.githubusercontent.com` | Raw host to read from, for proxies and mirrors. |
| `timeout` | `number` | `15000` | Request timeout in milliseconds. |

## Environment variables

| Variable | Overrides | Use |
| --- | --- | --- |
| `ASTROC4_REF` | `highlighting.ref` | Pin the grammar ref from CI without editing the config file. Wins over the option. |
| `ASTROC4_OFFLINE` | `highlighting.offline` | `1`, `true`, `yes` or `on` to use the bundled snapshot. |

Both are read with `process.env`, so they apply to `astro dev`, `astro build`,
`astro check` and `astro sync` alike.

## Fence meta options

| Key | Default | Meaning |
| --- | --- | --- |
| `view` | first view in the snippet, or required for an empty fence | Which view to render. |
| `project` | the only project; required when there are several | For an empty fence: which project the view is in. |
| `file` | — | A `.c4` file relative to the page, inside the site, rendered instead of the fence body. |
| `title` | translated `Diagram` | Shell heading. |
| `description` | — | Shell sub-heading. |
| `height` | `420` | Diagram height in pixels. |
| `collapsible` | `true` | Render the shell as a `<details>`. |
| `defaultOpen` | `true` | Whether that `<details>` starts open. |

## `<LikeC4View>` props

| Prop | Type | Default |
| --- | --- | --- |
| `viewId` | `string` | required |
| `project` | `string` | the only project; required when there are several |
| `file` | `string` | — (a `.c4` file relative to `src/`) |
| `projectId` | `string` | deprecated alias of `project` |
| `title` / `description` | `string` | translated defaults |
| `height` | `number` | `480` |
| `collapsible` / `defaultOpen` | `boolean` | `true` |

## What is *not* configurable, on purpose

- **The grammar source.** It is always the Langium grammar; the TextMate grammar
  upstream maintains by hand drifts, and the derivation is what the tests pin.
- **Where fences render.** Only `.mdx` pages can host a component, so a
  ` ```likec4 ` fence in a `.md` page is left as a code block with a warning
  naming the file.
- **Layout timing.** Diagrams are laid out during the build, never in the
  browser, so an invalid model cannot reach production.
