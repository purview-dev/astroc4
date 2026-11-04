# Icons

LikeC4 elements take an `icon` property. Three sources work, one does not.

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

## What does not work: `imageAliases`

LikeC4's `imageAliases` configuration resolves icons through the compiler, which
bakes an absolute `file://` path into the client bundle. That path exists on the
build machine and nowhere else, so the icon 502s in the browser. Use one of the
three forms above instead.

## Prerendered icons

Pack icons are React components, so they are server-rendered as inline SVG where
LikeC4's renderer allows it; URL and file icons are `<img>` elements. The smoke
test counts both and asserts the self-hosted one in the playground actually
resolves (`/icons/demo.svg`).
