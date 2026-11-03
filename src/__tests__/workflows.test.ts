import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The release workflow authenticates to npm with trusted publishing (OIDC), so
 * the invariants below are load-bearing security properties, not style:
 *
 *   - `id-token: write` is what mints the token that gets exchanged;
 *   - any `NODE_AUTH_TOKEN` / `NPM_TOKEN` would be a long-lived credential in
 *     the repository, which is the thing trusted publishing removes;
 *   - `registry-url` in `setup-node` writes an `_authToken=${NODE_AUTH_TOKEN}`
 *     placeholder into `.npmrc` that npm then tries to use instead of OIDC.
 *
 * A test is the only place these can be checked without running Actions, and a
 * regression here fails the PR that introduces it.
 */
const workflow = (name: string) =>
	readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');

/**
 * The workflows and the pipeline config document these decisions in comments
 * (`registry-url` is not used *because* …), so assert against the configuration,
 * not the prose: drop every full-line comment. `#` is the YAML comment, `//` the
 * JSONC one.
 */
const code = (source: string) =>
	source
		.split(/\r?\n/)
		.filter((line) => !/^\s*(#|\/\/)/.test(line))
		.join('\n');

const release = code(workflow('release.yml'));
const pr = code(workflow('pr.yml'));

describe('the release workflow', () => {
	it('authenticates with trusted publishing, not a token', () => {
		expect(release).toMatch(/id-token:\s*write/);
		expect(release).not.toMatch(/NODE_AUTH_TOKEN/);
		expect(release).not.toMatch(/NPM_TOKEN/);
		expect(release).not.toMatch(/secrets\.NPM/);
	});

	it('does not let setup-node install an auth placeholder', () => {
		expect(release).not.toMatch(/registry-url/);
	});

	it('asserts the npm CLI floor trusted publishing needs', () => {
		expect(release).toMatch(/npm@\^11\.5\.1/);
		expect(release).toMatch(/ACTIONS_ID_TOKEN_REQUEST_URL/);
	});

	it('leaves provenance to npm, which attaches it automatically', () => {
		// Deliberate: the flag is unnecessary under trusted publishing, and it
		// cannot succeed while the source repository is private.
		expect(release).not.toMatch(/--provenance/);
	});

	it('says how to fix an unconfigured trusted publisher', () => {
		// Without a publisher npm exits ENEEDAUTH ("authorize this machine"),
		// which reads like a missing secret. It is not: there is no secret.
		expect(release).toMatch(/ENEEDAUTH/);
		expect(release).toMatch(/npm trust github @purview-dev\/astroc4/);
	});

	it('publishes under a dist-tag, so a prerelease never becomes latest', () => {
		expect(release).toMatch(/--tag/);
		expect(release).toMatch(/tag=prerelease/);
	});

	it('keeps latest on the newest prerelease until a stable release exists', () => {
		// The registry refuses to delete `latest` (400 on DELETE), so a package
		// with no stable version would otherwise leave the npm page and a bare
		// install on whatever the first publish happened to be.
		expect(release).toMatch(/Keep latest on the newest prerelease/);
		expect(release).toMatch(/npm dist-tag add "@purview-dev\/astroc4@\$VERSION" latest/);
		// A missing dist-tag permission must not fail a release.
		expect(release).toMatch(/::warning::Could not move latest/);
	});

	it('only runs on a version bump', () => {
		expect(release).toMatch(/paths:\s*\n\s*-\s*package\.json/);
	});

	it('tags the release only after a successful publish', () => {
		expect(release).toMatch(/needs:\s*publish/);
		expect(release).toMatch(/purview-dev\/build\/\.github\/workflows\/purview-release\.yml@main/);
	});

	it('grants the called release workflow the permissions it declares', () => {
		// A reusable workflow can only use what its caller grants, and this file
		// sets `contents: read` workflow-wide: without the explicit grant the
		// shared action cannot push the tag or create the release.
		expect(release).toMatch(/permissions:\s*\n\s*contents:\s*write/);
		expect(release).toMatch(/packages:\s*write/);
	});
});

describe('the PR workflow', () => {
	it('runs the organisation gate', () => {
		expect(pr).toMatch(/uses:\s*purview-dev\/build\/\.github\/workflows\/purview-build\.yml@main/);
	});

	it('grants the called build workflow the permissions it declares', () => {
		// The shared workflow declares `contents: read` and `packages: read`; a
		// called workflow cannot request more than its caller grants, and GitHub
		// fails such a run at startup before any job exists. Missing this looked
		// like "workflow file issue" with nothing else to go on.
		expect(pr).toMatch(/permissions:\s*\n\s*contents:\s*read\s*\n\s*packages:\s*read/);
	});

	it('leaves install, build and test to the shared Web pipeline', () => {
		// The gate owns them through `.config/purview-build.json`; duplicating
		// them here would mean two different answers to "does this branch build".
		expect(pr).not.toMatch(/bun run grammar:check/);
		expect(pr).not.toMatch(/bun run check/);
		expect(pr).not.toMatch(/bun run test\b(?!:)/);
	});

	it('runs the smoke test and the packed consumer site', () => {
		expect(pr).toMatch(/scripts\/smoke\.mjs/);
		expect(pr).toMatch(/bun run test:site/);
	});

	it('holds no npm credential either', () => {
		expect(pr).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN/);
	});
});

describe('the pipeline configuration', () => {
	const config = JSON.parse(
		// JSONC: `purview-build.json` is commented like the other repositories'.
		code(readFileSync(new URL('../../.config/purview-build.json', import.meta.url), 'utf8')).replace(
			/,\s*([}\]])/g,
			'$1',
		),
	);

	it('tells the shared pipeline this is a Web repository, not a .NET one', () => {
		expect(config.Build.ProjectType).toBe('Web');
		expect(config.Build.WebInstallCommand).toMatch(/bun install/);
		expect(config.Build.WebTestCommand).toBe('bun run test');
		expect(config.Build.WebBuildOutput).toBe('playground/dist');
	});

	it('checks the grammar snapshot before the type-check and the build', () => {
		const build: string = config.Build.WebBuildCommand;

		expect(build.indexOf('grammar:check')).toBeGreaterThan(-1);
		expect(build.indexOf('grammar:check')).toBeLessThan(build.indexOf('bun run check'));
		expect(build.indexOf('bun run check')).toBeLessThan(build.indexOf('bun run build'));
	});

	it('does not run modules this repository has no scripts for', () => {
		expect(config.Build.RunLint).toBe(false);
		expect(config.Build.RunPack).toBe(false);
		expect(config.Build.ValidatePack).toBe(false);
	});

	it('leaves publishing to the release workflow', () => {
		expect(config.Release.Mode).toBe('None');
	});
});
