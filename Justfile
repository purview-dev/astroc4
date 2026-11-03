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

# Static build of the playground
[group('Build')]
build:
    bun run build

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

# Pack the tarball and build a throwaway Starlight site from it
[group('Verify')]
test-site:
    bun run test:site

# Browser smoke test against a running preview server (start `just preview` first)
[group('Verify')]
smoke url="http://localhost:4321":
    bun scripts/smoke.mjs {{url}}

# Fail if the committed grammar snapshot is stale
[group('Grammar')]
grammar-check:
    bun run grammar:check

# Regenerate the grammar snapshot from likec4/likec4 (default ref: main)
[group('Grammar')]
grammar-sync ref="main":
    bun scripts/sync-grammar.mjs --ref {{ref}}

# Validate the playground's LikeC4 model
[group('Grammar')]
likec4-validate:
    bun run likec4:validate

# The shared gate's chain (`WebBuildCommand` then `WebTestCommand`), plus the
# packed consumer site — i.e. what a PR must pass.
[group('Verify')]
verify: grammar-check check build test test-site
    @echo "All checks passed."
