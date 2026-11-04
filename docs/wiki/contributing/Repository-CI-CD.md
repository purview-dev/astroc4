# Repository CI/CD

Two workflows, both following the purview-dev pattern: a shared organisation
workflow for the gate, repository-local jobs for the work that only makes sense
here.

## `pr.yml`

| Job | Purpose |
| --- | --- |
| `Build and test` | Calls `purview-dev/build/.github/workflows/purview-build.yml@main` — the organisation gate. `.config/purview-build.json` declares `ProjectType: Web`, so it installs with Bun, runs the build command below, then the test command. `run-pack: false` and `validate-pack: false`: this repository ships no NuGet package. |
| `Live grammar` | `bun run test:network` — the only test that talks to likec4/likec4. |
| `Browser smoke test` | Builds the playground, starts `astro preview`, runs `scripts/smoke.ts` against it with Chromium installed. Uploads `preview.log` on failure. |
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
| `Publish to npm` | Runs the unit suite and `grammar:check`, **builds the package** (`build:lib`) and refuses to continue unless `dist/` carries the entry points, their declarations and the grammar data, reads the version, skips when the version is already on the registry, then `npm publish --access public --tag <dist-tag>` authenticated by **trusted publishing**. |
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

`npm publish --tag prerelease` puts a prerelease under `prerelease`, so that tag
can be pinned (`bun add @purview-dev/astroc4@prerelease`). A version without a
prerelease suffix publishes under `latest`.

`latest` **cannot be deleted** — the registry answers `400 Bad Request` to
`DELETE …/dist-tags/latest`, because a package with published versions must have
one. So the release workflow keeps it honest instead:

| State | `latest` | `prerelease` |
| --- | --- | --- |
| No stable release yet | the newest prerelease (CI moves it after each publish) | the newest prerelease |
| A stable release exists | the newest stable (its publish sets it) | the last prerelease |

Moving the tag needs the **"Allow npm dist-tag"** permission on the trusted
publisher (npm ≥ 11.21). It is granted for this package, so the publish job moves
`latest` itself. Without it the step warns rather than failing, the registry
answers `403 … This trusted publisher cannot manage dist-tags`, and the move has
to be done by hand — which needs a browser 2FA approval:

```sh
npm dist-tag add @purview-dev/astroc4@<version> latest
```

The step only moves `latest` while `latest` itself is a prerelease, so once
`1.0.0` ships a `1.0.1-prerelease.1` can never pull the default install back onto
a prerelease.

It also runs on `workflow_dispatch`, and that is how `latest` first reached
`1.0.0-prerelease.4`: a dispatch re-runs the check without republishing anything
(the publish step skips a version already on the registry), and the tag move
succeeds over OIDC. Both tags now resolve `1.0.0-prerelease.4`.

### The published package is a build artifact

`exports` points at `dist/`, which is gitignored. The publish job therefore runs
`bun run build:lib` and refuses to continue unless `dist/` carries the entry
points, their declarations and the grammar data — `1.0.0-prerelease.3` shipped
without them and could not be imported, because the job published a fresh
checkout straight after the tests. `prepublishOnly` runs
`scripts/check-dist.ts`, which walks the `exports` map and fails when any target
is missing, so a local `npm publish` cannot repeat it either.

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
`package.json` and the specifiers in `src/index.ts` and `src/fences.ts` only.

The publish job runs in the GitHub **environment `npm`**. It declares no
required reviewer, so a merged version bump publishes unattended; the environment
exists to keep a deployment record per release and to restrict the job to
protected branches (`main`). The OIDC token carries `environment: npm` as a
claim, which is what lets the trusted publisher be narrowed to it later.

Leaving the trusted publisher's `Environment name` **empty works** — verified by
running the workflow in this environment: the OIDC exchange against a publisher
that names no environment succeeded. Filling it in *narrows* the publisher to
runs in that environment, which is worthwhile defence in depth; npm cannot edit a
connection, so that means deleting and re-creating it.

| Field | Value |
| --- | --- |
| Organization or user | `purview-dev` |
| Repository | `astroc4` |
| Workflow filename | `release.yml` |
| Environment name | *empty, or `npm` to narrow it to the publish job* |
| Allow npm publish | ticked |
| Allow npm dist-tag | ticked |

The CLI cannot grant the dist-tag permission (npm 11.x only exposes
`--allow-publish` and `--allow-stage-publish`), so the web UI is the way in for
that one.

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

   `--allow-publish` is **not** the default: without it the relationship may only
   stage a release, and `npm publish` gets no token at all — which npm reports as
   `ENEEDAUTH` ("you need to authorize this machine"), not as a permission error.
   In the web UI the same switch is the *Allow npm publish* checkbox.

   The web UI does the same thing at
   <https://www.npmjs.com/package/@purview-dev/astroc4/access> → *Trusted
   Publisher* → GitHub Actions:

   | Field | Value |
   | --- | --- |
   | Organization or user | `purview-dev` |
   | Repository | `astroc4` |
   | Workflow filename | `release.yml` |
   | Environment name | *(empty — this repository's publish job runs in `npm`, which an empty claim matches)* |

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
| `npm` | environment | The publish job runs in it: a deployment record per release, restricted to protected branches. No required reviewer, so merging a version bump publishes without a prompt. |
| `secrets: inherit` | — | Forwards the organisation NuGet secrets the shared workflows expect, even though this repository publishes none. |
| `PURVIEW_NUGET_SOURCE_MAPPING` | variable | Organisation feed mapping; forwarded by the shared workflows. |

No npm secret exists, by design. If you ever add one, it is a bug: trusted
publishing is the only supported path here.

## Branch protection

`main` is protected: a pull request is required, the four PR checks must pass
(`Build and test / Build`, `Live grammar`, `Browser smoke test`, `Packed consumer
site`), the branch must be up to date with `main`, force pushes and deletion are
refused. Administrators can bypass, so a docs-only fix can still be pushed
directly — deliberately, because a `package.json` change is what publishes.

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
| `Browser smoke test` | `bun run preview` then `bun scripts/smoke.ts http://localhost:4321` |
| `Packed consumer site` | `bun run test:site` |

`Justfile` wraps each of them.
