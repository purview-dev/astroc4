// Bundles the Node entry points into `dist/`, emits their declarations and copies
// the grammar data. A site's `astro.config.ts` loads this package with
// `node_modules` externalised, so it has to ship JavaScript; the components stay
// source because the consuming site compiles `.astro` and `.tsx` itself.

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Read at runtime relative to `import.meta.url`, so they sit next to the bundle. */
const DATA = ['likec4.tmLanguage.json', 'like-c4.langium'];

const ENTRIES = ['index', 'integration', 'expressive-code'];

/** A relative `.ts` specifier, as written in the sources. */
const TS_SPECIFIER = /((?:from|import\()\s*['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g;

function run(command: string, args: string[]): void {
	execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

async function declarations(folder: string): Promise<string[]> {
	const entries = await readdir(folder, { withFileTypes: true, recursive: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.d.ts'))
		.map((entry) => join(entry.parentPath, entry.name));
}

await rm(DIST, { recursive: true, force: true });

// Dependencies stay external: peers resolve from the site.
run('bun', [
	'build',
	...ENTRIES.map((entry) => `src/${entry}.ts`),
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

run('bunx', ['tsc', '-p', 'tsconfig.json', '--emitDeclarationOnly']);

// tsc keeps `./x.ts` in declarations; next to the bundles the file is `./x.js`.
for (const file of await declarations(DIST)) {
	const source = await readFile(file, 'utf8');
	const rewritten = source.replace(TS_SPECIFIER, '$1$2.js$3');

	if (rewritten !== source) await writeFile(file, rewritten);
}

await mkdir(DIST, { recursive: true });
for (const file of DATA) {
	await copyFile(join(ROOT, 'src', 'grammar', file), join(DIST, file));
	await readFile(join(DIST, file));
}

for (const entry of ENTRIES) {
	for (const file of [`${entry}.js`, `${entry}.d.ts`]) {
		if (new RegExp(TS_SPECIFIER.source).test(await readFile(join(DIST, file), 'utf8'))) {
			throw new Error(`dist/${file} still imports a .ts specifier — it would fail under Node`);
		}
	}
}

console.log('built dist/ (bundle, declarations, grammar data)');
