set quiet

# Astroc4 is a Bun package. Every recipe delegates to a `bun run` script, so
# package.json stays the single source of truth for what each command does and
# CI cannot drift from the local workflow.

[private]
default:
    just --list

# Install dependencies
[group('Develop')]
install:
    bun install

# Playground dev server at http://localhost:4321
[group('Develop')]
dev:
    bun run dev

# Plain-Astro example (no Starlight) at http://localhost:4322
[group('Develop')]
dev-astro:
    bun run dev:astro

# Static build of the playground
[group('Build')]
build:
    bun run build

# Static build of the plain-Astro example
[group('Build')]
build-astro:
    bun run build:astro

# Serve the built playground
[group('Build')]
preview:
    bun run preview

# astro check over playground/ and src/
[group('Verify')]
check:
    bun run check

# Hermetic unit suite: scanner, generator, snapshot, fetch policy, plugin, fences
[group('Verify')]
test:
    bun run test

# Unit suite plus the live check against likec4/likec4
[group('Verify')]
test-network:
    bun run test:network

# Pack the tarball, install it into copies of playground/ and examples/astro/,
# then build both, run the full smoke suite against the Starlight copy and check
# the plain-Astro one hydrates in Chromium
[group('Verify')]
test-site:
    bun run test:site

# Browser smoke test against a running preview server (start `just preview` first)
[group('Verify')]
smoke url="http://localhost:4321":
    bun scripts/smoke.ts {{url}}

# Check that one diagram hydrates, against a running site (start `just dev` first)
[group('Verify')]
hydration url="http://localhost:4321":
    bun scripts/hydration.ts {{url}}

# Fail if the committed grammar snapshot is stale
[group('Grammar')]
grammar-check:
    bun run grammar:check

# Regenerate the grammar snapshot from likec4/likec4 (default ref: main)
[group('Grammar')]
grammar-sync ref="main":
    bun scripts/sync-grammar.ts --ref {{ref}}

# Validate the playground's LikeC4 model
[group('Grammar')]
likec4-validate:
    bun run likec4:validate

# The shared gate's chain (`WebBuildCommand` then `WebTestCommand`), plus the
# packed consumer sites — i.e. what a PR must pass. `test-site` ends in Chromium,
# so run `bunx playwright install chromium` once.
[group('Verify')]
verify: grammar-check check build test test-site
    @echo "All checks passed."
