# Repository CI/CD

Two workflows, both following the purview-dev pattern: a shared organisation
workflow for the gate, repository-local jobs for the work that only makes sense
here.

## `pr.yml`

| Job | Purpose |
| --- | --- |
| `Build and test` | Calls `purview-dev/build/.github/workflows/purview-build.yml@main` — the organisation gate. `.config/purview-build.json` declares `ProjectType: Web`, so it installs with Bun, runs the build command below, then the test command. `run-pack: false` and `validate-pack: false`: this repository ships no NuGet package. |
| `Live grammar` | `bun run test:network` — the only test that talks to likec4/likec4. |
| `Browser smoke test` | Builds the playground, starts `astro preview`, runs `scripts/smoke.mjs` against it with Chromium installed. Uploads `preview.log` on failure. |
| `Packed consumer site` | `bun run test:site`: pack the tarball, install it into a throwaway Starlight site and build that. |

### `.config/purview-build.json`

The gate is configured, not scripted, so the local and CI answers to "does this
build" cannot diverge:

| Setting | Value | Why |
| --- | --- | --- |
| `ProjectType` | `Web` | Bun commands instead of the .NET modules, the same arrangement `purview-dev.github.io` uses. |
| `WebInstallCommand` | `bun install --frozen-lockfile` | A PR must not silently update the lockfile. |
| `WebBuildCommand` | `bun run grammar:check && bun run check && bun run build` | Ordered to fail fastest: a grammar snapshot that drifted from its derivation, then the type-check, then the playground build. |
| `WebTestCommand` | `bun run test` | The hermetic suite; the live grammar check is its own job. |
| `RunLint` | `false` | No linter or formatter is configured in this repository yet. |
| `RunPack`, `ValidatePack` | `false` | Nothing is packed; astroc4 publishes to npm from `release.yml`. |
| `WebBuildOutput` | `playground/dist` | What `bun run build` produces. |
| `Release.Mode` | `None` | The release workflow passes `GitHubRelease`; the build pipeline publishes nothing. |

`grammar:check` runs before the type-check on purpose: the grammar is generated,
and a derivation change without a regenerated snapshot is the failure mode a
review is most likely to miss.

The live grammar check is its own job so a red run says "upstream moved the
grammar" (or GitHub is down) rather than "this branch broke something".

## `release.yml`

Triggers on a push to `main` that changes `package.json` — the version lives
there, and that is true for the .NET repositories too (`Version__Source =
PackageJson`).

| Job | Purpose |
| --- | --- |
| `Publish to npm` | Runs the unit suite and `grammar:check`, reads the version, skips when the version is already on the registry, then `npm publish --access public --tag <dist-tag>` authenticated by **trusted publishing**. |
| `Tag and GitHub release` | `purview-dev/build/.github/workflows/purview-release.yml@main` with `release-mode: GitHubRelease`, `run-pack: false`, `validate-pack: false`. |

### Why npm and not NuGet

Astroc4 is consumed by Astro's bundler; a `.nupkg` cannot be. The organisation's
release action is still used — `GitHubRelease` mode tags the repository and
creates the release with generated notes — and the npm publish runs *before* it,
so a failed publish never leaves a release pointing at an uninstallable version.

If a NuGet artefact is ever wanted (for example a package that only carries the
generated grammar for .NET tooling), add a `NuGet` publish step; it must not
replace the npm one.

### Dist-tags

`1.0.0-prerelease.1` publishes under the `prerelease` tag, so a bare install
keeps resolving a stable release. A version without a prerelease suffix
publishes under `latest`. The tag is applied by `npm publish --tag`, which is
part of the publish itself — managing dist-tags afterwards would need the extra
"Allow npm dist-tag" permission on the trusted publisher, which this repository
does not enable.

**The bootstrap publish also sets `latest`,** whatever `--tag` it was given: a
package's first version always becomes `latest`. Left alone, `latest` would stay
pinned to that first prerelease while CI publishes newer ones under `prerelease`,
so a bare `bun add @purview-dev/astroc4` would install a stale version. Either
delete it once:

```sh
npm dist-tag rm @purview-dev/astroc4 latest
```

…which leaves `bun add @purview-dev/astroc4@prerelease` as the only way in until
`1.0.0` ships, or accept that `latest` is a prerelease for now and revisit when
the first stable release lands.

### Idempotency

Both halves are safe to re-run: the npm step checks `npm view @purview-dev/astroc4@<version>`
first, and the shared release workflow skips when the `v<version>` tag exists.

## Publishing authentication: npm trusted publishing

The publish job holds **no npm token**. It authenticates with an OIDC token that
GitHub mints for that workflow run, which npm exchanges for a short-lived
credential scoped to the `purview-dev/astroc4` repository and to `release.yml`.
There is nothing to rotate, leak or revoke.

### What the workflow does

| Step | Why |
| --- | --- |
| `permissions: id-token: write` on the publish job | Without it there is no OIDC token to exchange. |
| Asserts `ACTIONS_ID_TOKEN_REQUEST_URL` is set | Trusted publishing only works on GitHub-hosted runners; a self-hosted runner fails here with a message that says so, instead of a confusing 401 later. |
| `npm install -g 'npm@^11.5.1'`, then asserts the floor | Trusted publishing needs npm CLI **11.5.1 or later**. |
| No `registry-url` in `setup-node` | That option writes `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into `.npmrc`; with no token defined the unresolved placeholder is what npm would try to use instead of the OIDC exchange. |
| No `--provenance`, no `NODE_AUTH_TOKEN` on the publish step | Provenance attestations are generated automatically under trusted publishing. Forcing the flag is unnecessary and can only fail. |

### One-time setup

The package is **scoped** — `@purview-dev/astroc4` — because npm refuses the
unscoped name with *"Package name too similar to existing package astro"*. A
scope also needs its npm **organisation** to exist (`purview-dev`, which is the
GitHub org name, not the same thing on npm; create it at
<https://www.npmjs.com/org/create> if `npm org ls purview-dev` reports it
missing). If the organisation name is unavailable, the package can live under
the personal scope instead: `@kieronlanning/astroc4`, which changes
`package.json` and the specifiers in `src/index.mjs` and `src/fences.mjs` only.

Trusted publishing is configured **per package, in the package's settings**, so
the package has to exist on npm first. `@purview-dev/astroc4` has never been
published:

1. **Bootstrap the first version once, locally**, from an account that can
   publish to the scope (`npm login`):

   ```sh
   npm org ls purview-dev          # is the scope yours to publish to?
   bun run test && bun run grammar:check
   npm publish --access public --tag prerelease
   ```

   This consumes `1.0.0-prerelease.1`. Do it once; every later release goes
   through CI. `--access public` is required: a scoped package defaults to
   restricted, and CI passes it too.

2. **Add the trusted publisher.** From the CLI (npm ≥ 11.20), in the same
   session:

   ```sh
   npm trust github @purview-dev/astroc4 \
     --repo purview-dev/astroc4 \
     --file release.yml \
     --allow-publish

   npm trust list @purview-dev/astroc4   # expect the release.yml relationship
   ```

   The web UI does the same thing at
   <https://www.npmjs.com/package/@purview-dev/astroc4/access> → *Trusted
   Publisher* → GitHub Actions:

   | Field | Value |
   | --- | --- |
   | Organization or user | `purview-dev` |
   | Repository | `astroc4` |
   | Workflow filename | `release.yml` |
   | Environment name | *(empty — the publish job declares no environment)* |

3. Bump the version and merge; `release.yml` publishes the next one with no
   secret involved.

Both the `repository` field in `package.json` and the trusted publisher name
`purview-dev/astroc4`, and npm validates the workflow filename — so renaming
`release.yml` stops publishing until the trusted publisher is updated. That also
rules out publishing from the shared `purview-release.yml`: a called workflow
changes which filename is validated.

### Caveats

- **GitHub-hosted runners only.** Self-hosted is not supported yet.
- **Provenance needs a public repository.** Publishing works from a private
  repository, but npm does not attach provenance attestations for one. Flipping
  `purview-dev/astroc4` to public is what starts producing them.
- A package can have up to 10 trusted publishers, and an existing one cannot be
  edited — delete it and create a new one.

## Secrets and variables

| Name | Kind | Used for |
| --- | --- | --- |
| `secrets: inherit` | — | Forwards the organisation NuGet secrets the shared workflows expect, even though this repository publishes none. |
| `PURVIEW_NUGET_SOURCE_MAPPING` | variable | Organisation feed mapping; forwarded by the shared workflows. |

No npm secret exists, by design. If you ever add one, it is a bug: trusted
publishing is the only supported path here.

## Releasing

1. Bump `version` in `package.json` (`1.0.0-prerelease.2`, `1.0.0`, …).
2. Merge to `main`.

That is the whole process: the workflow tests, publishes, tags and writes the
release notes. Nothing else needs to be bumped, and no file is generated at
release time.

## Local equivalents

| Workflow job | Locally |
| --- | --- |
| `Build and test` | `just verify` — the same chain as `WebBuildCommand` then `WebTestCommand` |
| `Live grammar` | `bun run test:network` |
| `Browser smoke test` | `bun run preview` then `bun scripts/smoke.mjs http://localhost:4321` |
| `Packed consumer site` | `bun run test:site` |

`Justfile` wraps each of them.
