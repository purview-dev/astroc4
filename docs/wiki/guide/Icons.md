# Icons

LikeC4 elements take an `icon` property. Every form LikeC4 accepts works, in
discovered and [named projects](../../../README.md#projects) alike.

## 1. A bundled pack

```
model {
  docs = system 'Docs site' {
    icon tech:astro
  }
}
```

The packs come from LikeC4's `LIB_ICON` terminal — `aws`, `azure`, `bootstrap`,
`gcp`, `md`, `tech` today — and astroc4 reads that list out of the grammar, so a
pack upstream adds highlights and renders without a change here.

The icon set is compiled by LikeC4's Vite plugin into the `likec4:icons` module,
which the islands read.

## 2. An absolute URL

```
icon https://example.com/logo.svg
```

## 3. A file under the site's `public/`

```
# src/likec4/model.c4
icon /icons/demo.svg
```

Paths are resolved relative to the `.c4` file and rewritten to the site path, so
the browser never sees a build-machine path. Astroc4 checks this in the smoke
test: a `file://` URL in an `<img src>` is a failure.

## 4. `imageAliases`, unchanged

```json
// likec4.config.json — the project's own, as LikeC4 and its VS Code extension read it
{ "name": "architecture", "imageAliases": { "@": "../../.assets/images" } }
```

```
icon @/azure/entra/entra-id-logo.svg
```

Nothing changes in the project for astroc4. At build time astroc4 maps each
icon LikeC4 compiled to a local file — through an alias or a relative path — to
`/_astroc4/<project>/<path>`:

| Icon | Served at |
| --- | --- |
| `@/azure/entra/x.svg` (`@` → `images/`) | `/_astroc4/architecture/azure/entra/x.svg` |
| `@brand/logo.svg` (`@brand` → `../brand`) | `/_astroc4/architecture/brand/logo.svg` |
| `../shared/a.svg` | `/_astroc4/architecture/__up/shared/a.svg` |

`astro dev` serves those from the original files; `astro build` copies the ones
the model uses into the output. Files under the site's `public/` keep their
public URL. No `file://` path reaches the client bundle, nothing is written into
the source tree, and a missing icon or two files at the same URL fail the build.

## How icons render

Pack icons are React components, so they are server-rendered as inline SVG where
LikeC4's renderer allows it. Local SVG files are inlined by LikeC4 too; other
local files and URLs are `<img>` elements. The smoke test checks the playground's
`public/` icon and the `@` alias icon of a project outside the site render, that
the alias icon is served at its `/_astroc4/` URL, and that no `file://` string is
in the build output.
