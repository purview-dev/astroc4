// build.ts
// path: scripts/build.ts
// Builds the published package into `dist/` with Bun, then emits the type
// declarations Bun cannot produce.
//
// Why a build at all: `src/index.ts` is imported from a site's
// `astro.config.mjs`, which Astro loads through Vite with `node_modules`
// externalised — a package that shipped `.ts` sources would never be
// transformed, and Node would fail on the extension. The components are the
// exception and stay source: `.astro` and `.tsx` are compiled by the consumer's
// own build, which is why `exports` points at `src/components/*` and
// `src/index.ts` sets `ssr.noExternal`.
//
//   bun run build:lib
//
// Runs in three steps: bundle (Bun), declare (tsc), copy the grammar data.

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Read at runtime, relative to `import.meta.url`, so they must sit next to the bundle. */
const DATA = ['likec4.tmLanguage.json', 'like-c4.langium'];

/** Runs a binary from `node_modules/.bin` (or PATH on Windows) from the repo root. */
function run(command: string, args: string[]): void {
	execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

await rm(DIST, { recursive: true, force: true });

// 1. Bundle. Three entry points, ESM, Node target. `--packages external` keeps
// every dependency out of the bundle — they are peer dependencies, so they must
// resolve from the site, not from here. `import.meta.url` survives bundling
// into `dist/index.js`, which is why the data files land in `dist/` below.
run('bun', [
	'build',
	'src/index.ts',
	'src/integration.ts',
	'src/expressive-code.ts',
	'--root',
	'src',
	'--outdir',
	'dist',
	'--target',
	'node',
	'--format',
	'esm',
	'--packages',
	'external',
	'--sourcemap=linked',
]);

// 2. Declarations. `bun build` emits none, and a hand-written `.d.ts` used to
// shadow the implementation's own types — the exact drift this replaces.
run('bunx', ['tsc', '-p', 'tsconfig.json', '--emitDeclarationOnly']);

// 3. Grammar data. `source.ts` reads both with `new URL('./<name>', import.meta.url)`;
// after bundling that resolves to `dist/`, not `dist/grammar/`.
await mkdir(DIST, { recursive: true });
for (const file of DATA) {
	await copyFile(join(ROOT, 'src', 'grammar', file), join(DIST, file));
}

// Verify rather than assume: a missing data file only fails at runtime, and
// only for `offline: true` — precisely the case a build with no network needs.
for (const file of DATA) {
	await readFile(join(DIST, file));
}

// A `.ts` specifier left in a bundle only fails when a site's config imports it.
for (const entry of ['index.js', 'integration.js', 'expressive-code.js']) {
	const bundle = await readFile(join(DIST, entry), 'utf8');

	if (/from ['"]\.\/[^'"]+\.ts['"]/.test(bundle)) {
		throw new Error(`${entry} still imports a .ts specifier — it would fail under Node`);
	}
}

console.log('built dist/ (bundle, declarations, grammar data)');
